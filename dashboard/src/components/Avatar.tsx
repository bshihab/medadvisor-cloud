// Member circle: solid brand blue or teal (deterministic per name), white
// semibold first initial only. (Ambient-glass handoff — no gradients.)
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span
      className={hash % 2 === 0 ? "bg-accent" : "bg-teal"}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: "none",
        borderRadius: 999,
        color: "#fff",
        fontWeight: 600,
        fontSize: size * 0.4,
      }}
    >
      {initial}
    </span>
  );
}
