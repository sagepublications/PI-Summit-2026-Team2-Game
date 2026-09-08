/**
 * Colours, typography and layout — from the spec mock-ups.
 * All sizes are in DESIGN pixels: the scene is authored at 1080×1920 and
 * scaled uniformly to fit the window (see TableScene.resize).
 */
export const DESIGN = { width: 1080, height: 1920 } as const;

export const theme = {
  colors: {
    table: 0x120e0c, // canvas background outside the frame
    frame: 0x1c1714, // charcoal device frame
    frameEdge: 0x3a2a1e,
    card: 0x4b1d15, // maroon card
    cardEdge: 0x8a4a2c,
    ink: 0x181818, // situation text box
    parchment: 0xf3ead8,
    parchmentText: 0x1f1a14,
    gold: 0xc9963c,
    goldDim: 0x7a5a26,
    barTrack: 0x2a2018,
    good: 0x6fae5c,
    bad: 0xd64a3c,
    danger: 0xd64a3c,
  },
  font: {
    family: 'Georgia, "Times New Roman", Times, serif',
    situation: 46,
    situationMin: 30,
    choice: 34,
    choiceMin: 24,
    label: 24,
    header: 34,
    preview: 26,
  },
  layout: {
    margin: 60,
    hud: { top: 90, iconSize: 56, barWidth: 196, barHeight: 12 },
    header: { y: 372 },
    card: { x: 80, y: 430, width: 920, height: 1420, radius: 44 },
    textBox: { inset: 50, top: 50, minHeight: 250, padding: 40, tiltDeg: -1.5 },
    /** Portrait picture panel (2:3 art fills it); `top` is measured from the card's top edge. */
    illustration: { top: 370, width: 560, height: 780, radius: 28, padding: 14 },
    choice: { width: 370, height: 170, bottom: 60, tiltDeg: 3 },
  },
} as const;
