"use client";

import { formatHour } from "@/lib/time";

// The 24-hour schedule dial. Each of the 24 segments is one hour; segments
// inside [startHour, endHour] light up amber. A teal tick marks the current
// hour so the strip always reads against real time, not just the schedule.
export default function SlotStrip({ startHour = 0, endHour = 23, compact = false }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const nowHour = new Date().getHours();

  const isLit = (h) => {
    if (startHour <= endHour) return h >= startHour && h <= endHour;
    return h >= startHour || h <= endHour;
  };

  return (
    <div className={`slotstrip ${compact ? "slotstrip--compact" : ""}`}>
      <div className="slotstrip__track">
        {hours.map((h) => (
          <div
            key={h}
            className={`slotstrip__seg ${isLit(h) ? "is-lit" : ""} ${h === nowHour ? "is-now" : ""}`}
            title={formatHour(h)}
          />
        ))}
      </div>
      {!compact && (
        <div className="slotstrip__labels">
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>12 AM</span>
        </div>
      )}
    </div>
  );
}
