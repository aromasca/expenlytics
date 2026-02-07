import { Badge } from '@/components/ui/badge'

interface CategoryBadgeProps {
  name: string
  color: string
}

export function CategoryBadge({ name, color }: CategoryBadgeProps) {
  return (
    <Badge
      variant="outline"
      style={{ borderColor: color, color }}
    >
      {name}
    </Badge>
  )
}
