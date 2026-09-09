"use client";

import { useEffect, useRef } from "react";

export function AutoSubmit() {
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    const form = document.getElementById("magic-verify-form");
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }, []);

  return null;
}
