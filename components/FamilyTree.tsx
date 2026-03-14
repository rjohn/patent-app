'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

export interface PatentNode {
  id: string
  number: string
  title: string
  status: string
  type: string
  filedDate?: string
  grantDate?: string
  continuationType?: string
  children?: PatentNode[]
}

interface FamilyTreeProps {
  root: PatentNode
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

export default function FamilyTree({ root, width = 900, height = 500 }: FamilyTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: PatentNode } | null>(null)

  useEffect(() => {
    if (!svgRef.current || !root) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 40, right: 120, bottom: 40, left: 120 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    // Build hierarchy
    const hierarchy = d3.hierarchy(root)
    const treeLayout = d3.tree<PatentNode>()
      .size([innerH, innerW])
      .separation((a, b) => (a.parent === b.parent ? 1.2 : 1.8))

    const treeData = treeLayout(hierarchy)

    // Zoom & pan container
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2])
      .on('zoom', (event) => {
        g.attr('transform', `translate(${margin.left + event.transform.x},${margin.top + event.transform.y}) scale(${event.transform.k})`)
      })

    svg.call(zoom)

    // Links
    const linkGenerator = d3.linkHorizontal<d3.HierarchyPointLink<PatentNode>, d3.HierarchyPointNode<PatentNode>>()
      .x(d => d.y)
      .y(d => d.x)

    const links = g.selectAll('.patent-tree-link')
      .data(treeData.links())
      .enter()
      .append('g')

    links.append('path')
      .attr('class', 'patent-tree-link')
      .attr('d', linkGenerator as any)

    // Continuation type label on links
    links.each(function(d) {
      const contType = d.target.data.continuationType
      if (!contType) return
      const label = CONTINUATION_LABELS[contType] || contType

      const mx = (d.source.y + d.target.y) / 2
      const my = (d.source.x + d.target.x) / 2

      d3.select(this).append('text')
        .attr('x', mx)
        .attr('y', my - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(74,144,217,0.6)')
        .attr('font-size', '10px')
        .attr('font-family', 'var(--font-mono)')
        .text(label)
    })

    // Nodes
    const nodes = g.selectAll('.patent-tree-node')
      .data(treeData.descendants())
      .enter()
      .append('g')
      .attr('class', 'patent-tree-node')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer')

    // Node background rect
    nodes.append('rect')
      .attr('x', -80)
      .attr('y', -24)
      .attr('width', 160)
      .attr('height', 48)
      .attr('rx', 8)
      .attr('fill', d => d.depth === 0 ? 'rgba(45,90,158,0.6)' : 'rgba(27,58,107,0.5)')
      .attr('stroke', d => STATUS_COLORS[d.data.status] || 'rgba(74,144,217,0.3)')
      .attr('stroke-width', d => d.depth === 0 ? 2 : 1.5)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition().duration(150)
          .attr('fill', 'rgba(45,90,158,0.8)')
          .attr('stroke-width', 2.5)
        setTooltip({ x: event.clientX, y: event.clientY, node: d.data })
      })
      .on('mousemove', function(event) {
        setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null)
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .transition().duration(150)
          .attr('fill', d.depth === 0 ? 'rgba(45,90,158,0.6)' : 'rgba(27,58,107,0.5)')
          .attr('stroke-width', d.depth === 0 ? 2 : 1.5)
        setTooltip(null)
      })

    // Status dot
    nodes.append('circle')
      .attr('cx', 66)
      .attr('cy', -14)
      .attr('r', 4)
      .attr('fill', d => STATUS_COLORS[d.data.status] || '#9CA3AF')

    // Patent number
    nodes.append('text')
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#4A90D9')
      .attr('font-size', '10px')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-weight', '500')
      .text(d => d.data.number.length > 18 ? d.data.number.substring(0, 17) + '…' : d.data.number)

    // Title (truncated)
    nodes.append('text')
      .attr('y', 8)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.8)')
      .attr('font-size', '9px')
      .attr('font-family', 'var(--font-body)')
      .text(d => {
        const t = d.data.title
        return t.length > 22 ? t.substring(0, 21) + '…' : t
      })

    // Type badge
    nodes.append('text')
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(168,181,204,0.6)')
      .attr('font-size', '8px')
      .attr('font-family', 'var(--font-body)')
      .text(d => d.data.type)

  }, [root, width, height])

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="w-full"
        style={{ background: 'transparent' }}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 card p-3 text-xs pointer-events-none shadow-xl max-w-xs"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="font-mono text-patent-sky mb-1">{tooltip.node.number}</div>
          <div className="text-white font-medium mb-1">{tooltip.node.title}</div>
          <div className="flex items-center gap-3 text-patent-muted">
            <span>{tooltip.node.status}</span>
            <span>{tooltip.node.type}</span>
            {tooltip.node.filedDate && <span>Filed: {tooltip.node.filedDate}</span>}
          </div>
          {tooltip.node.continuationType && (
            <div className="mt-1 text-patent-sky/70">{tooltip.node.continuationType.replace(/_/g, ' ')}</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 card px-3 py-2 flex items-center gap-4 text-xs">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1.5 text-patent-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            {status}
          </span>
        ))}
      </div>

      {/* Controls hint */}
      <div className="absolute top-3 left-3 text-[10px] text-patent-muted">
        Scroll to zoom · Drag to pan
      </div>
    </div>
  )
}
