export type DemoVerdict = "supported" | "contradicted" | "unsupported" | "ambiguous";

export type DemoClaim = {
  id: number;
  verdict: DemoVerdict;
  text: string;
  explanation: string;
  source: string;
  page: number;
  quote: string;
  type: string;
  confidence: "High" | "Medium" | "Low";
};

export const demoAuditId = "northstar-demo";
export const demoAnswer = "Northstar’s annual revenue reached $48.2 million in 2024, representing 18% year-over-year growth. The company operates in 12 markets and serves more than 2,400 business customers. Its gross margin improved to 64% as operating expenses declined by 9%.";
export const demoSources = [
  "Northstar Annual Report 2024.pdf",
  "Strategy & Operations Update.docx",
  "Corporate Overview.xlsx",
];

export const demoClaims: DemoClaim[] = [
  { id: 1, verdict: "supported", text: "Northstar’s annual revenue reached $48.2 million in 2024", explanation: "The annual report states total revenue of $48.2 million for 2024.", source: demoSources[0], page: 14, quote: "Total revenue for the year ended December 31, 2024 was $48.2 million, an increase from the prior year.", type: "Financial figure", confidence: "High" },
  { id: 2, verdict: "supported", text: "representing 18% year-over-year growth", explanation: "The report describes revenue growth of 18% compared with 2023.", source: demoSources[0], page: 14, quote: "Revenue increased 18% year over year, primarily driven by expansion in existing accounts.", type: "Growth rate", confidence: "High" },
  { id: 3, verdict: "contradicted", text: "The company operates in 12 markets", explanation: "The strategy update lists 10 active markets, while two additional launches are planned for next year.", source: demoSources[1], page: 27, quote: "Our current footprint spans 10 markets, with two additional launches planned for next year.", type: "Geographic scope", confidence: "High" },
  { id: 4, verdict: "supported", text: "serves more than 2,400 business customers", explanation: "The corporate overview reports 2,460 active business customers.", source: demoSources[2], page: 8, quote: "Active business customers: 2,460 as of December 2024.", type: "Customer count", confidence: "High" },
  { id: 5, verdict: "unsupported", text: "Its gross margin improved to 64% as operating expenses declined by 9%", explanation: "The sources support a 64% gross margin, but do not substantiate the claimed 9% decline in operating expenses.", source: demoSources[0], page: 31, quote: "Gross margin increased to 64% in 2024. Operating expenses totaled $21.6 million.", type: "Financial performance", confidence: "Medium" },
];

export function splitAnswerByClaims(answer: string) {
  const codePoints = Array.from(answer);
  const spans = demoClaims
    .map((claim) => {
      const claimText = Array.from(claim.text);
      let start = -1;
      outer: for (let index = 0; index <= codePoints.length - claimText.length; index += 1) {
        for (let offset = 0; offset < claimText.length; offset += 1) {
          if (codePoints[index + offset] !== claimText[offset]) continue outer;
        }
        start = index;
        break;
      }
      return { claim, start, end: start < 0 ? -1 : start + claimText.length };
    })
    .filter((span) => span.start >= 0)
    .sort((first, second) => first.start - second.start);

  const output: Array<{ text: string; claim?: DemoClaim }> = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor || span.end > codePoints.length) continue;
    if (span.start > cursor) output.push({ text: codePoints.slice(cursor, span.start).join("") });
    output.push({ text: codePoints.slice(span.start, span.end).join(""), claim: span.claim });
    cursor = span.end;
  }
  if (cursor < codePoints.length) output.push({ text: codePoints.slice(cursor).join("") });
  return output;
}
