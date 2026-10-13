import { describe, expect, it, vi } from "vitest";
import { isRazorpayTestKey, razorpayTestRequestError } from "@/server/payments/razorpay-test";

describe("Razorpay test payment guard", () => {
  it("accepts Razorpay test keys and rejects live or malformed keys", () => {
    expect(isRazorpayTestKey("rzp_test_example")).toBe(true);
    expect(isRazorpayTestKey("rzp_live_example")).toBe(false);
    expect(isRazorpayTestKey("")).toBe(false);
  });

  it("returns a safe gateway error while logging the provider failure", () => {
    const providerFailure = new Error("Razorpay order request failed (401): authentication failed");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(razorpayTestRequestError(providerFailure)).toMatchObject({
      status: 502,
      code: "RAZORPAY_TEST_REQUEST_FAILED",
      message: "Razorpay could not create a test order. Check that the test key and secret are valid.",
    });
    expect(error).toHaveBeenCalledWith("[razorpay-test] failed to create test order", providerFailure);

    error.mockRestore();
  });
});
