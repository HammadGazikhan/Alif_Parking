import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { excludeRegistered, toDirectoryPeople } from "@/server/directory/graph";
import { createEmployee } from "@/server/services/employee.service";
import { createUser, resetDb } from "./fixtures";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));

vi.mock("@/server/auth", () => ({
  auth: vi.fn(async () => session.current),
}));

const directoryRoute = await import("@/app/api/directory/users/route");

const GRAPH_USERS = [
  { displayName: "Zara Ali", mail: "Zara.Ali@aligconsulting.com", userPrincipalName: "zara.ali@aligconsulting.com", jobTitle: "Consultant" },
  { displayName: "Bilal Shah", mail: null, userPrincipalName: "Bilal.Shah@aligconsulting.com", jobTitle: null },
  { displayName: "Guest User", mail: "guest@gmail.com", userPrincipalName: "guest_gmail.com#EXT#@aligconsulting.onmicrosoft.com" },
  { displayName: "Already Here", mail: "already.here@aligconsulting.com", userPrincipalName: "already.here@aligconsulting.com" },
  { displayName: "Alias Person", mail: "alias@aligconsulting.com", userPrincipalName: "alias.upn@aligconsulting.com" },
];

describe("directory helpers", () => {
  it("normalises Graph users and drops guests", () => {
    const people = toDirectoryPeople(GRAPH_USERS);
    expect(people.map((p) => p.email)).toEqual([
      "alias@aligconsulting.com",
      "already.here@aligconsulting.com",
      "bilal.shah@aligconsulting.com",
      "zara.ali@aligconsulting.com",
    ]);
    expect(people.find((p) => p.name === "Bilal Shah")?.upn).toBe("bilal.shah@aligconsulting.com");
  });

  it("keeps a directory phone only when it matches the portal format", () => {
    const people = toDirectoryPeople([
      {
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "Mobile Person",
        mail: "mobile@aligconsulting.com",
        userPrincipalName: "mobile@aligconsulting.com",
        mobilePhone: "+91 98765 43210",
        businessPhones: ["022 4000 1000"],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        displayName: "Desk Person",
        mail: "desk@aligconsulting.com",
        userPrincipalName: "desk@aligconsulting.com",
        mobilePhone: null,
        businessPhones: ["022 4000 1000"],
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        displayName: "Bad Phone",
        mail: "bad.phone@aligconsulting.com",
        userPrincipalName: "bad.phone@aligconsulting.com",
        mobilePhone: "n/a",
        businessPhones: ["123"],
      },
    ]);
    expect(people.find((p) => p.name === "Mobile Person")).toMatchObject({ phone: "+91 98765 43210" });
    expect(people.find((p) => p.name === "Desk Person")).toMatchObject({ phone: "022 4000 1000" });
    expect(people.find((p) => p.name === "Bad Phone")?.phone).toBeNull();
  });

  it("excludes anyone whose mail or UPN is already registered", () => {
    const people = toDirectoryPeople(GRAPH_USERS);
    const left = excludeRegistered(people, ["Already.Here@aligconsulting.com", "alias.upn@aligconsulting.com"]);
    expect(left.map((p) => p.name)).toEqual(["Bilal Shah", "Zara Ali"]);
  });
});

describe("GET /api/directory/users", () => {
  const req = (search = "") => new Request(`http://localhost/api/directory/users?search=${encodeURIComponent(search)}`);
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token", expires_in: 3600 });
    return Response.json({ value: GRAPH_USERS });
  });

  beforeEach(async () => {
    await resetDb();
    session.current = null;
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID = "client-id";
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET = "client-secret";
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER = "https://login.microsoftonline.com/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b/v2.0";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  });

  it("is admin-only", async () => {
    expect((await directoryRoute.GET(req(), undefined)).status).toBe(401);
    const employee = await createUser("EMPLOYEE");
    session.current = { user: { id: employee.id, role: "EMPLOYEE" } };
    expect((await directoryRoute.GET(req(), undefined)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only returns people who are not in the portal yet", async () => {
    const admin = await createUser("ADMIN");
    session.current = { user: { id: admin.id, role: "ADMIN" } };
    await prisma.user.create({ data: { name: "Already Here", email: "already.here@aligconsulting.com" } });
    await prisma.user.create({ data: { name: "Alias", email: "alias.upn@aligconsulting.com" } });

    const res = await directoryRoute.GET(req("a"), undefined);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.map((p: { email: string }) => p.email)).toEqual([
      "bilal.shah@aligconsulting.com",
      "zara.ali@aligconsulting.com",
    ]);

    const graphCall = fetchMock.mock.calls.find(([u]) => u.toString().includes("graph.microsoft.com"));
    const graphUrl = new URL(graphCall![0].toString());
    expect(graphUrl.searchParams.get("$search")).toContain('"displayName:a"');
    expect(graphUrl.searchParams.get("$filter")).toContain("accountEnabled eq true");
  });

  it("drops a person from the results once they are added", async () => {
    const admin = await createUser("ADMIN");
    session.current = { user: { id: admin.id, role: "ADMIN" } };
    await createEmployee(admin, {
      email: "zara.ali@aligconsulting.com",
      name: "Zara Ali",
      phone: "",
      designation: "Consultant",
      parkingEligible: true,
      freePass: false,
      status: "ACTIVE",
    });
    const { data } = await (await directoryRoute.GET(req(), undefined)).json();
    expect(data.map((p: { email: string }) => p.email)).not.toContain("zara.ali@aligconsulting.com");
  });

  it("returns 503 with a clear message when Microsoft Graph is not configured", async () => {
    const admin = await createUser("ADMIN");
    session.current = { user: { id: admin.id, role: "ADMIN" } };
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
    const res = await directoryRoute.GET(req(), undefined);
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/not configured/i);
  });
});

describe("createEmployee", () => {
  const directoryId = "44444444-4444-4444-8444-444444444444";
  const input = {
    email: "photo.user@aligconsulting.com",
    name: "Photo User",
    phone: "+91 98765 43210",
    designation: "Consultant",
    parkingEligible: true,
    freePass: false,
    status: "ACTIVE" as const,
    directoryId,
  };

  beforeEach(async () => {
    await resetDb();
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID = "client-id";
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET = "client-secret";
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER = "https://login.microsoftonline.com/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b/v2.0";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  });

  function stubGraph(photo: Response) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input.toString();
        if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token", expires_in: 3600 });
        if (url.includes("/photos/48x48/$value")) return photo;
        if (url.includes("graph.microsoft.com/v1.0/users/")) {
          return Response.json({ mail: "photo.user@aligconsulting.com", userPrincipalName: "photo.user@aligconsulting.com" });
        }
        return new Response(null, { status: 404 });
      }),
    );
  }

  it("stores the directory photo when Graph returns one for that email", async () => {
    const admin = await createUser("ADMIN");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    stubGraph(new Response(jpeg, { headers: { "content-type": "image/jpeg" } }));
    await createEmployee(admin, input);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(stored.avatarType).toBe("image/jpeg");
    expect(Buffer.from(stored.avatar!)).toEqual(Buffer.from(jpeg));
    expect(stored.phone).toBe(input.phone);
    expect(stored.designation).toBe("Consultant");
  });

  it("still creates the employee when the directory has no photo", async () => {
    const admin = await createUser("ADMIN");
    stubGraph(new Response(null, { status: 404 }));
    await createEmployee(admin, input);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(stored.avatar).toBeNull();
    expect(stored.avatarType).toBeNull();
  });

  it("does not store a photo for a different directory account", async () => {
    const admin = await createUser("ADMIN");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input.toString();
        if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token", expires_in: 3600 });
        if (url.includes("graph.microsoft.com")) {
          return Response.json({ mail: "someone.else@aligconsulting.com", userPrincipalName: "someone.else@aligconsulting.com" });
        }
        return new Response(jpeg, { headers: { "content-type": "image/jpeg" } });
      }),
    );
    await createEmployee(admin, input);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(stored.avatar).toBeNull();
  });

  it("rejects an email that already has a portal account", async () => {
    const admin = await createUser("ADMIN");
    const input = {
      email: "dup@aligconsulting.com",
      name: "Dup",
      phone: "",
      designation: "",
      parkingEligible: true,
      freePass: false,
      status: "ACTIVE" as const,
    };
    await createEmployee(admin, input);
    await expect(createEmployee(admin, input)).rejects.toMatchObject({ status: 409, fieldErrors: { email: expect.any(String) } });
  });
});
