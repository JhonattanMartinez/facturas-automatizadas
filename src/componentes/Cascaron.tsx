"use client";

import { usePathname } from "next/navigation";
import { MenuSuperior } from "./MenuSuperior";

export function Cascaron() {
  return usePathname() === "/login" ? null : <MenuSuperior />;
}
