"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type Me } from "./api";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/v1/me"), refetchInterval: 15_000 });
}
