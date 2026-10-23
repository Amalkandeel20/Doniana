import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, googleCalendarUrl, type CalendarEvent } from "./calendar";

const event: CalendarEvent = {
  uid: "DN-ABC123@doniana",
  title: "DONIANA — رفع الحواجب",
  description: "رقم الحجز: DN-ABC123\nصبغة, إضافية; نعم",
  start: new Date("2026-11-02T08:00:00.000Z"),
  end: new Date("2026-11-02T09:15:00.000Z"),
};

describe("add to calendar", () => {
  it("builds a valid single-event calendar in UTC", () => {
    const ics = buildIcs(event, new Date("2026-10-23T10:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DTSTART:20261102T080000Z");
    expect(unfolded).toContain("DTEND:20261102T091500Z");
    expect(unfolded).toContain("DTSTAMP:20261023T100000Z");
    expect(unfolded).toContain("UID:DN-ABC123@doniana");
    expect(unfolded).toContain("SUMMARY:DONIANA — رفع الحواجب");
    expect(unfolded).toContain("DESCRIPTION:رقم الحجز: DN-ABC123\\nصبغة\\, إضافية\\; نعم");
  });

  it("folds long Arabic lines at 75 bytes without breaking characters", () => {
    const line = `SUMMARY:${"حواجب ".repeat(30)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("never leaks a management link into the event", () => {
    expect(buildIcs(event)).not.toContain("/a#");
  });

  it("creates a Google Calendar link with the same times", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261102T080000Z/20261102T091500Z");
    expect(url.searchParams.get("text")).toBe(event.title);
  });
});
