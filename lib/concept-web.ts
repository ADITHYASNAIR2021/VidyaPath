import { ALL_CHAPTERS } from '@/lib/data';

interface ConceptEdge {
  from: string;
  to: string;
  reason: string;
}

const BRIDGE_RULES: Array<{ source: RegExp; target: RegExp; reason: string }> = [
  { source: /electric|charge|field/i, target: /gauss|potential|capacitance/i, reason: 'Electrostatics progression' },
  { source: /gauss|capacitance/i, target: /dielectric|electrochem|solution/i, reason: 'Field-media bridge' },
  { source: /equilibrium|gibbs|electrochem/i, target: /cell|nernst|potential/i, reason: 'Thermo-electrochem link' },
  { source: /integration|differential/i, target: /motion|kinematics|electric/i, reason: 'Math-to-Physics toolchain' },
  { source: /probability|statistics/i, target: /genetics|inheritance|population/i, reason: 'Math-to-Biology inference' },
  { source: /biomolecules|organic/i, target: /life processes|metabolism|enzyme/i, reason: 'Chem-Bio continuity' },
];

function sanitizeNode(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nodeId(text: string): string {
  return `n_${text.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

export function buildConceptWebMermaid(options?: { classLevel?: 10 | 12; subject?: string }): string {
  const chapters = ALL_CHAPTERS
    .filter((chapter) => chapter.classLevel !== 11)
    .filter((chapter) => (options?.classLevel ? chapter.classLevel === options.classLevel : true))
    .filter((chapter) => (options?.subject && options.subject !== 'All' ? chapter.subject === options.subject : true))
    .slice(0, 40);

  const lines: string[] = ['graph LR'];
  const edges = new Set<string>();
  const conceptNodes: Array<{ id: string; label: string }> = [];

  for (const chapter of chapters) {
    const chapterNodeId = nodeId(`chapter_${chapter.id}`);
    const chapterLabel = sanitizeNode(`${chapter.subject} C${chapter.classLevel}: ${chapter.title}`);
    lines.push(`${chapterNodeId}["${chapterLabel}"]`);

    for (const topic of chapter.topics.slice(0, 3)) {
      const topicLabel = sanitizeNode(topic);
      const topicNodeId = nodeId(`${chapter.subject}_${topicLabel}`);
      conceptNodes.push({ id: topicNodeId, label: topicLabel });
      const link = `${chapterNodeId}-->${topicNodeId}`;
      if (!edges.has(link)) {
        lines.push(`${topicNodeId}["${topicLabel}"]`);
        lines.push(link);
        edges.add(link);
      }
    }
  }

  const topicLabels = Array.from(new Set(conceptNodes.map((node) => node.label)));
  const bridges: ConceptEdge[] = [];
  for (const source of topicLabels) {
    for (const target of topicLabels) {
      if (source === target) continue;
      for (const rule of BRIDGE_RULES) {
        if (rule.source.test(source) && rule.target.test(target)) {
          bridges.push({ from: source, to: target, reason: rule.reason });
          break;
        }
      }
    }
  }

  for (const bridge of bridges.slice(0, 48)) {
    const sourceId = nodeId(`bridge_${bridge.from}`);
    const targetId = nodeId(`bridge_${bridge.to}`);
    const edgeId = `${sourceId}-. ${bridge.reason} .->${targetId}`;
    if (edges.has(edgeId)) continue;
    lines.push(`${sourceId}["${sanitizeNode(bridge.from)}"]`);
    lines.push(`${targetId}["${sanitizeNode(bridge.to)}"]`);
    lines.push(edgeId);
    edges.add(edgeId);
  }

  return lines.join('\n');
}
