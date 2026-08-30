// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";

import { useFocusTrap } from "@/features/accessibility/use-focus-trap";

function Harness() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, () => setOpen(false), open);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open review</button>
      {open ? (
        <section ref={dialogRef} role="dialog" tabIndex={-1}>
          <button type="button">First</button>
          <button type="button">Last</button>
        </section>
      ) : null}
    </>
  );
}

describe("useFocusTrap", () => {
  it("contains tab focus, closes on Escape, and restores the trigger", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open review" });
    trigger.focus();
    fireEvent.click(trigger);

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
