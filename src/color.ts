export const PARTY_COLORS = [
  "#ff4d6d",
  "#ffd166",
  "#06d6a0",
  "#4cc9f0",
  "#c77dff",
  "#ff9f1c",
  "#f72585",
  "#80ffdb",
  "#fee440",
  "#ffffff",
];

export function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 92% 70%)`;
}
