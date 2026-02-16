'use client'

import { useMemo, useRef, useState } from 'react'
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey'
import { useTheme } from '@/components/theme-provider'
import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'

interface SankeyRow {
  category: string
  category_group: string
  color: string
  amount: number
}

interface SankeyChartProps {
  data: SankeyRow[]
  incomeData: SankeyRow[]
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

export function SankeyChart({ data, incomeData, totalIncome }: SankeyChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [hoveredLink, setHoveredLink] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; amount: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const incomeColor = isDark ? '#34D399' : '#10B981'
  const savingsColor = isDark ? '#34D399' : '#10B981'
  const groupColor = isDark ? '#52525B' : '#A1A1AA'

  const layout = useMemo(() => {
    if (data.length === 0) return null

    const totalSpent = data.reduce((s, d) => s + d.amount, 0)
    const savings = Math.max(0, totalIncome - totalSpent)

    // Income sources (left column)
    const incomeSources = incomeData.length > 0
      ? incomeData
      : [{ category: 'Income', category_group: 'Income & Transfers', color: incomeColor, amount: totalIncome }]

    // Spending groups (middle column)
    const groupMap = new Map<string, number>()
    for (const d of data) {
      groupMap.set(d.category_group, (groupMap.get(d.category_group) ?? 0) + d.amount)
    }
    if (savings > 0) {
      groupMap.set('Savings', savings)
    }
    const groups = Array.from(groupMap.entries())

    // Nodes: income sources | groups | spending categories (+ savings)
    const nodes: NodeExtra[] = [
      ...incomeSources.map(d => ({ name: d.category, color: incomeColor })),
      ...groups.map(([g]) => ({ name: g, color: g === 'Savings' ? savingsColor : groupColor })),
      ...data.map(d => ({ name: d.category, color: d.color })),
    ]
    // Add savings as a right-column node if applicable
    if (savings > 0) {
      nodes.push({ name: 'Net Savings', color: savingsColor })
    }

    const incomeCount = incomeSources.length
    const groupOffset = incomeCount
    const catOffset = groupOffset + groups.length
    const savingsNodeIdx = savings > 0 ? nodes.length - 1 : -1

    const links: Array<{ source: number; target: number; value: number }> = []

    // Income sources → spending groups (distribute proportionally)
    const totalIncomeFromSources = incomeSources.reduce((s, d) => s + d.amount, 0)
    for (let i = 0; i < incomeSources.length; i++) {
      const src = incomeSources[i]
      const srcFraction = totalIncomeFromSources > 0 ? src.amount / totalIncomeFromSources : 1 / incomeSources.length
      for (let g = 0; g < groups.length; g++) {
        const val = Math.round(groups[g][1] * srcFraction * 100) / 100
        if (val > 0) {
          links.push({ source: i, target: groupOffset + g, value: val })
        }
      }
    }

    // Groups → spending categories
    for (let c = 0; c < data.length; c++) {
      const d = data[c]
      const gIdx = groups.findIndex(([g]) => g === d.category_group)
      links.push({ source: groupOffset + gIdx, target: catOffset + c, value: d.amount })
    }

    // Savings group → savings node
    if (savings > 0 && savingsNodeIdx >= 0) {
      const sIdx = groups.findIndex(([g]) => g === 'Savings')
      links.push({ source: groupOffset + sIdx, target: savingsNodeIdx, value: savings })
    }

    const width = 900
    const nodeCount = Math.max(incomeSources.length, groups.length, data.length + (savings > 0 ? 1 : 0))
    const height = Math.max(250, Math.min(500, nodeCount * 16 + 40))

    const generator = sankey<NodeExtra, LinkExtra>()
      .nodeWidth(12)
      .nodePadding(4)
      .nodeSort(null)
      .extent([[120, 4], [width - 120, height - 4]])

    const graph = generator({
      nodes: nodes.map(n => ({ ...n })),
      links: links.map(l => ({ ...l })),
    })

    return { ...graph, width, height }
  }, [data, incomeData, totalIncome, incomeColor, savingsColor, groupColor])

  const showTooltip = (e: React.MouseEvent, label: string, amount: string) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 8, label, amount })
  }

  const hideTooltip = () => {
    setTooltip(null)
  }

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
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ maxHeight: 500 }}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => { setHoveredLink(null); hideTooltip() }}
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
                onMouseEnter={(e) => {
                  setHoveredLink(i)
                  showTooltip(e, `${source.name} → ${target.name}`, formatCurrency(link.value))
                }}
                onMouseMove={(e) => showTooltip(e, `${source.name} → ${target.name}`, formatCurrency(link.value))}
                onMouseLeave={() => { setHoveredLink(null); hideTooltip() }}
                style={{ transition: 'opacity 0.15s' }}
              />
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
            const isRight = node.depth === (nodes as SNode[]).reduce((max, n) => Math.max(max, n.depth ?? 0), 0)

            return (
              <g key={i}>
                <rect
                  x={x0}
                  y={y0}
                  width={x1 - x0}
                  height={Math.max(1, nodeHeight)}
                  fill={node.color}
                  rx={1}
                  onMouseEnter={(e) => showTooltip(e, node.name, formatCurrency(node.value ?? 0))}
                  onMouseMove={(e) => showTooltip(e, node.name, formatCurrency(node.value ?? 0))}
                  onMouseLeave={hideTooltip}
                />
                {nodeHeight > 8 && (
                  <text
                    x={isLeft ? x0 - 4 : isRight ? x1 + 4 : x1 + 4}
                    y={(y0 + y1) / 2}
                    dy="0.35em"
                    textAnchor={isLeft ? 'end' : 'start'}
                    fill={textColor}
                    fontSize={9}
                    fontFamily="system-ui, sans-serif"
                    style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}
                  >
                    {node.name}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded border bg-popover px-2 py-1 shadow-sm"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
          >
            <div className="text-[11px] text-muted-foreground">{tooltip.label}</div>
            <div className="text-xs font-medium tabular-nums">{tooltip.amount}</div>
          </div>
        )}
      </div>
    </Card>
  )
}
