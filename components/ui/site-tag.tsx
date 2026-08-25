import { VerticalText } from './vertical-text'

export function SiteTag({ name }: { name: string }) {
  return (
    <div className="flex h-32 w-12 items-center justify-center rounded border-2 border-amber-900 bg-amber-100 text-amber-950">
      <VerticalText text={name} />
    </div>
  )
}
