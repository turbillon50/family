interface Props {
  handle: string;
  displayName: string;
  color: string;
  size?: number;
}

export function AgentAvatar({ handle, displayName, color, size = 28 }: Props) {
  const initial = displayName.slice(0, 1).toUpperCase();
  return (
    <span
      aria-label={displayName}
      title={`@${handle}`}
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}66`,
        fontSize: Math.round(size * 0.42),
        textShadow: `0 0 8px ${color}55`,
      }}
    >
      {initial}
    </span>
  );
}
