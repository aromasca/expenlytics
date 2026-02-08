'use client'

import { useMemo, useState } from 'react'
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey'
import { useTheme } from '@/components/theme-provider'
import { Card } from '@/components/ui/card'

interface SankeyChartProps {
  data: Array<{ category: string; category_group: string; color: string; amount: number }>
  totalIncome: number
}

interface NodeExtra {
  name: string
  color: string
}

interface LinkExtra {
  value: number
}

type SNode = SankeyNode<NodeExtra, LinkExtra>
type SLink = SankeyLink<NodeExtra, LinkExtra>

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function SankeyChart({ data, totalIncome }: SankeyChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [hoveredLink, setHoveredLink] = useState<number | null>(null)

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const incomeColor = isDark ? '#34D399' : '#10B981'
  const groupColor = isDark ? '#A1A1AA' : '#737373'

  const layout = useMemo(() => {
    if (data.length === 0) return null

    // Build unique groups
    const groupMap = new Map<string, number>()
    for (const d of data) {
      groupMap.set(d.category_group, (groupMap.get(d.category_group) ?? 0) + d.amount)
    }

    const groups = Array.from(groupMap.entries())
    const nodes: NodeExtra[] = [
      { name: 'Income', color: incomeColor },
      ...groups.map(([g]) => ({ name: g, color: groupColor })),
      ...data.map((d) => ({ name: d.category, color: d.color })),
    ]

    const links: Array<{ source: number; target: number; value: number }> = []

    // Income -> Group links
    groups.forEach(([, total], i) => {
      links.push({ source: 0, target: 1 + i, value: total })
    })

    // Group -> Category links
    data.forEach((d, i) => {
      const groupIdx = groups.findIndex(([g]) => g === d.category_group)
      links.push({ source: 1 + groupIdx, target: 1 + groups.length + i, value: d.amount })
    })

    const width = 600
    const height = Math.max(200, Math.min(400, data.length * 18 + 40))

    const generator = sankey<NodeExtra, LinkExtra>()
      .nodeWidth(12)
      .nodePadding(4)
      .nodeSort(null)
      .extent([[0, 4], [width, height - 4]])

    const graph = generator({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    })

    return { ...graph, width, height }
  }, [data, incomeColor, groupColor])

  if (data.length === 0) {
    return (
      <Card className="p-3">
        <h3 className="text-xs font-medium text-muted-foreground mb-2">Money Flow</h3>
        <p className="text-center text-muted-foreground py-6 text-xs">No data available</p>
      </Card>
    )
  }

  if (!layout) return null

  const { nodes, links, width, height } = layout

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-2">Money Flow</h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: 400 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Links */}
        {(links as SLink[]).map((link, i) => {
          const path = sankeyLinkHorizontal()(link)
          if (!path) return null
          const opacity =
            hoveredLink === null ? 0.3 : hoveredLink === i ? 0.6 : 0.1
          const source = link.source as SNode
          const target = link.target as SNode
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={source.color}
              strokeWidth={Math.max(1, link.width ?? 0)}
              opacity={opacity}
              onMouseEnter={() => setHoveredLink(i)}
              onMouseLeave={() => setHoveredLink(null)}
            >
              <title>{`${source.name} → ${target.name}: ${fmt.format(link.value)}`}</title>
            </path>
          )
        })}

        {/* Nodes */}
        {(nodes as SNode[]).map((node, i) => {
          const x0 = node.x0 ?? 0
          const x1 = node.x1 ?? 0
          const y0 = node.y0 ?? 0
          const y1 = node.y1 ?? 0
          const nodeHeight = y1 - y0
          const isLeft = node.depth === 0
          const isRight = node.depth === 2

          return (
            <g key={i}>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={Math.max(1, nodeHeight)}
                fill={node.color}
                rx={1}
              >
                <title>{`${node.name}: ${fmt.format(node.value ?? 0)}`}</title>
              </rect>
              {nodeHeight > 8 && (
                <text
                  x={isLeft ? x0 - 4 : x1 + 4}
                  y={(y0 + y1) / 2}
                  dy="0.35em"
                  textAnchor={isLeft ? 'end' : 'start'}
                  fill={textColor}
                  fontSize={9}
                  fontFamily="system-ui, sans-serif"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {node.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </Card>
  )
}
