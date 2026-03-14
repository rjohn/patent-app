'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as d3 from 'd3'

export interface PatentNode {
  id: string
  number: string
  title: string
  status: string
  type: string
  source?: string
  filedDate?: string
  grantDate?: string
  continuationType?: string
  children?: PatentNode[]
}

interface FamilyTreeProps {
  root: PatentNode
  currentId?: string     // highlights the "you are here" node
  width?: number
  height?: number
}

const STATUS_COLORS: Record<string, string> = {
  GRANTED:   '#22C55E',
  PENDING:   '#E6B84A',
  ABANDONED: '#EF4444',
  EXPIRED:   '#9CA3AF',
  PUBLISHED: '#3B82F6',
}

const CONTINUATION_LABELS: Record<string, string> = {
  CONTINUATION:          'CON',
  CONTINUATION_IN_PART:  'CIP',
  DIVISIONAL:            'DIV',
  REISSUE:               'REI',
  REEXAMINATION:         'REX',
}

const NODE_W = 172
const NODE_H = 52

export default function FamilyTree({ root, currentId, width = 960, height = 520 }: FamilyTreeProps) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const router   = useRouter()
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: PatentNode } | null>(null)

  useEffect(() => {
    if (!svgRef.current || !root) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 48, right: 100, bottom: 48, left: 100 }
    const innerW  = width  - margin.left - margin.right

    const hierarchy  = d3.hierarchy(root)
    const nodeCount  = hierarchy.descendants().length
    const depthCount = (hierarchy.height || 0) + 1

    // Clamp vertical height so nodes aren't spread too far with few siblings
    const innerH  = Math.min(height - margin.top - margin.bottom, Math.max(nodeCount, 3) * 80)

    // Cap horizontal depth spacing so nodes don't spread off-screen
    const depthSpacing = Math.min(220, Math.max(160, innerW / Math.max(depthCount, 2)))
    const totalW = depthSpacing * (depthCount - 1) + NODE_W

    const treeLayout = d3.tree<PatentNode>()
      .size([innerH, totalW])
      .separation((a, b) => (a.parent === b.parent ? 1.2 : 1.6))

    const treeData = treeLayout(hierarchy)

    // Zoom container
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2.5])
      .on('zoom', e => g.attr('transform',
        `translate(${margin.left + e.transform.x},${margin.top + e.transform.y}) scale(${e.transform.k})`
      ))
    svg.call(zoom)

    // Defs — arrowhead marker
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 9).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', 'rgba(74,144,217,0.45)')

    // Links
    const linkGen = d3.linkHorizontal<d3.HierarchyPointLink<PatentNode>, d3.HierarchyPointNode<PatentNode>>()
      .x(d => d.y)
      .y(d => d.x)

    const linkGs = g.selectAll('.link-g')
      .data(treeData.links())
      .enter().append('g')

    linkGs.append('path')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(74,144,217,0.25)')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)')
      .attr('d', linkGen as any)

    // Continuation type badge on links
    linkGs.each(function(d) {
      const ct = d.target.data.continuationType
      if (!ct) return
      const label = CONTINUATION_LABELS[ct] || ct
      const mx = (d.source.y + d.target.y) / 2
      const my = (d.source.x + d.target.x) / 2

      const grp = d3.select(this)
      grp.append('rect')
        .attr('x', mx - 14).attr('y', my - 14)
        .attr('width', 28).attr('height', 16).attr('rx', 4)
        .attr('fill', 'rgba(45,90,158,0.7)')
        .attr('stroke', 'rgba(74,144,217,0.3)').attr('stroke-width', 1)

      grp.append('text')
        .attr('x', mx).attr('y', my - 3)
        .attr('text-anchor', 'middle')
        .attr('fill', '#4A90D9')
        .attr('font-size', '9px')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-weight', '600')
        .text(label)
    })

    // Nodes
    const nodeGs = g.selectAll('.node-g')
      .data(treeData.descendants())
      .enter().append('g')
      .attr('class', 'node-g')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer')

    // Shadow / glow for current node
    nodeGs.filter(d => d.data.id === currentId)
      .append('rect')
        .attr('x', -(NODE_W / 2) - 4).attr('y', -(NODE_H / 2) - 4)
        .attr('width', NODE_W + 8).attr('height', NODE_H + 8).attr('rx', 12)
        .attr('fill', 'none')
        .attr('stroke', '#4A90D9').attr('stroke-width', 2)
        .attr('opacity', 0.5)
        .attr('filter', 'blur(3px)')

    // Card background
    nodeGs.append('rect')
      .attr('x', -(NODE_W / 2)).attr('y', -(NODE_H / 2))
      .attr('width', NODE_W).attr('height', NODE_H).attr('rx', 9)
      .attr('fill', d => {
        if (d.data.id === currentId) return 'rgba(45,90,158,0.85)'
        if (d.data.source === 'CONTINUATION') return 'rgba(88,28,135,0.45)'
        return 'rgba(20,40,80,0.75)'
      })
      .attr('stroke', d => STATUS_COLORS[d.data.status] || 'rgba(74,144,217,0.3)')
      .attr('stroke-width', d => d.data.id === currentId ? 2 : 1.5)
      .on('mouseover', function(event, d) {
        d3.select(this).transition().duration(120)
          .attr('fill', 'rgba(45,90,158,0.9)')
          .attr('stroke-width', 2.5)
        setTooltip({ x: event.clientX, y: event.clientY, node: d.data })
      })
      .on('mousemove', function(event) {
        setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null)
      })
      .on('mouseout', function(event, d) {
        d3.select(this).transition().duration(120)
          .attr('fill', () => {
            if (d.data.id === currentId) return 'rgba(45,90,158,0.85)'
            if (d.data.source === 'CONTINUATION') return 'rgba(88,28,135,0.45)'
            return 'rgba(20,40,80,0.75)'
          })
          .attr('stroke-width', d.data.id === currentId ? 2 : 1.5)
        setTooltip(null)
      })
      .on('click', (event, d) => {
        if (d.data.id !== currentId) router.push(`/patents/${d.data.id}`)
      })

    // Status dot (top-right corner)
    nodeGs.append('circle')
      .attr('cx', (NODE_W / 2) - 10).attr('cy', -(NODE_H / 2) + 10)
      .attr('r', 4)
      .attr('fill', d => STATUS_COLORS[d.data.status] || '#9CA3AF')
      .attr('pointer-events', 'none')

    // "You" badge for current node
    nodeGs.filter(d => d.data.id === currentId)
      .append('text')
        .attr('x', -(NODE_W / 2) + 8).attr('y', -(NODE_H / 2) + 9)
        .attr('fill', '#93c5fd')
        .attr('font-size', '8px')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-weight', '700')
        .attr('pointer-events', 'none')
        .text('YOU')

    // Patent number
    nodeGs.append('text')
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#4A90D9')
      .attr('font-size', '10.5px')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text(d => {
        const n = d.data.number
        return n.length > 20 ? n.slice(0, 19) + '…' : n
      })

    // Title
    nodeGs.append('text')
      .attr('y', 8)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.75)')
      .attr('font-size', '8.5px')
      .attr('font-family', 'var(--font-body)')
      .attr('pointer-events', 'none')
      .text(d => {
        const t = d.data.title
        return t.length > 26 ? t.slice(0, 25) + '…' : t
      })

    // Type label
    nodeGs.append('text')
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(148,163,184,0.55)')
      .attr('font-size', '7.5px')
      .attr('font-family', 'var(--font-body)')
      .attr('pointer-events', 'none')
      .text(d => d.data.type + (d.data.source === 'CONTINUATION' ? ' · tracked' : ''))

    // Auto-center: if there's a current node focus on it, otherwise center the whole tree
    const currentNode = treeData.descendants().find(d => d.data.id === currentId)
    if (currentNode) {
      const tx = width  / 2 - currentNode.y - margin.left
      const ty = height / 2 - currentNode.x - margin.top
      svg.call(zoom.transform as any, d3.zoomIdentity.translate(tx, ty))
    } else {
      // Center the whole tree
      const allNodes = treeData.descendants()
      const minY = d3.min(allNodes, d => d.y) ?? 0
      const maxY = d3.max(allNodes, d => d.y) ?? 0
      const minX = d3.min(allNodes, d => d.x) ?? 0
      const maxX = d3.max(allNodes, d => d.x) ?? 0
      const treeW = maxY - minY + NODE_W
      const treeH = maxX - minX + NODE_H
      const tx = (width  - treeW) / 2 - minY
      const ty = (height - treeH) / 2 - minX
      svg.call(zoom.transform as any, d3.zoomIdentity.translate(tx, ty))
    }

  }, [root, currentId, width, height, router])

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: 'rgba(8,15,30,0.6)', border: '1px solid rgba(74,144,217,0.15)' }}>
      <svg ref={svgRef} width={width} height={height} className="w-full" style={{ background: 'transparent' }} />

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 card p-3 text-xs pointer-events-none shadow-2xl max-w-xs"
          style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}>
          <div className="font-mono mb-0.5" style={{ color: 'var(--patent-sky)' }}>{tooltip.node.number}</div>
          <div className="text-white font-medium mb-1.5 leading-tight">{tooltip.node.title}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-patent-muted">
            <span>{tooltip.node.status}</span>
            <span>{tooltip.node.type}</span>
            {tooltip.node.filedDate && <span>Filed {tooltip.node.filedDate}</span>}
            {tooltip.node.grantDate && <span>Granted {tooltip.node.grantDate}</span>}
          </div>
          {tooltip.node.continuationType && (
            <div className="mt-1" style={{ color: 'rgba(147,197,253,0.7)' }}>
              {tooltip.node.continuationType.replace(/_/g, ' ')}
            </div>
          )}
          {tooltip.node.id !== currentId && (
            <div className="mt-1.5 text-patent-muted italic">Click to open →</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex items-center gap-3 text-[10px] text-patent-muted px-3 py-2 rounded-lg"
        style={{ background: 'rgba(8,15,30,0.75)', border: '1px solid rgba(74,144,217,0.1)' }}>
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
            {s}
          </span>
        ))}
        <span className="flex items-center gap-1 ml-1">
          <span className="w-2 h-2 rounded" style={{ background: 'rgba(88,28,135,0.7)', border: '1px solid #a855f7' }} />
          TRACKED
        </span>
      </div>

      <div className="absolute top-3 left-3 text-[10px] text-patent-muted">
        Scroll to zoom · Drag to pan · Click node to open
      </div>
    </div>
  )
}
