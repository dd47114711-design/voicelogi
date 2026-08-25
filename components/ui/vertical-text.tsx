export function VerticalText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span
      className={`inline-block [writing-mode:vertical-rl] [text-combine-upright:digits_2] ${className}`}
    >
      {text}
    </span>
  )
}
