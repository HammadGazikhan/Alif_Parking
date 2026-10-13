"use client";

import { useState } from "react";
import { Pencil, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeFormSheet, type EditableEmployee } from "@/components/employees/employee-form-sheet";
import { EmployeeStatusDialog } from "@/components/employees/employee-status-dialog";
import { VehicleFormSheet, type CategoryOption, type EditableVehicle } from "@/components/vehicles/vehicle-form-sheet";

export function EmployeeDetailActions({ employee }: { employee: EditableEmployee }) {
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setStatusOpen(true)}>
        <Power /> {employee.status === "ACTIVE" ? "Deactivate" : "Activate"}
      </Button>
      <Button variant="ink" onClick={() => setEditOpen(true)}>
        <Pencil /> Edit employee
      </Button>
      <EmployeeFormSheet open={editOpen} onOpenChange={setEditOpen} employee={employee} />
      <EmployeeStatusDialog employee={statusOpen ? employee : null} onOpenChange={setStatusOpen} />
    </>
  );
}

export function AddVehicleButton({ user, categories }: { user: { id: string; name: string }; categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add vehicle
      </Button>
      <VehicleFormSheet open={open} onOpenChange={setOpen} fixedUser={user} categories={categories} />
    </>
  );
}

export function EditVehicleButton({
  vehicle,
  user,
  categories,
}: {
  vehicle: EditableVehicle;
  user: { id: string; name: string };
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${vehicle.number}`} onClick={() => setOpen(true)}>
        <Pencil />
      </Button>
      <VehicleFormSheet open={open} onOpenChange={setOpen} vehicle={vehicle} fixedUser={user} categories={categories} />
    </>
  );
}
