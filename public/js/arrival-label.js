/** The clock and the day label use the same time zone. */
export function arrivalSlotLabel(slot, now = new Date(), timeZone) {
  const options = timeZone ? { timeZone } : {};
  const day = new Intl.DateTimeFormat("en-US", { ...options, year: "numeric", month: "2-digit", day: "2-digit" });
  const time = new Intl.DateTimeFormat("en-US", { ...options, hour: "numeric", minute: "2-digit", hour12: true }).format(slot).replace(/\u202f|\u00a0/g, " ");
  const weekday = new Intl.DateTimeFormat("en-US", { ...options, weekday: "short" }).format(slot);
  return day.format(slot) === day.format(now) ? time : `${time} ${weekday}`;
}
