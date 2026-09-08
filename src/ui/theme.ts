/**
 * Colours, typography and layout.
 * Palette is the Sage brand (docs/Sage_Brand_Guidelines_Colours.pdf):
 * Navy #001A69 (primary), Highlight Blue #348AF7, Highlight Teal #08C9C4,
 * Pale #D9EEFF, white; navy for body text. Only `danger` is off-palette —
 * a functional red for the metric that is about to end (or has ended) the run.
 *
 * All sizes are in DESIGN pixels: the scene is authored at 1080×1920 and
 * scaled uniformly to fit the window (see TableScene.resize).
 */
export const DESIGN = { width: 1080, height: 1920 } as const;

const NAVY = 0x001a69;
const BLUE = 0x348af7;
const TEAL = 0x08c9c4;
const PALE = 0xd9eeff;
const WHITE = 0xffffff;

export const theme = {
  colors: {
    table: NAVY, // canvas background outside the frame
    frame: NAVY,
    frameEdge: BLUE,
    accent: BLUE, // headings, rules, corner marks
    card: BLUE,
    cardEdge: PALE,
    box: PALE, // situation text box
    boxText: NAVY,
    panel: NAVY, // picture panel behind the illustration
    panelEdge: PALE,
    tag: WHITE, // choice tags
    tagEdge: PALE,
    tagText: NAVY,
    arrow: WHITE,
    hudIcon: WHITE,
    hudLabel: WHITE,
    barTrack: WHITE, // drawn at low alpha
    barFill: TEAL,
    previewDot: WHITE, // one colour: size shows magnitude, never direction
    flash: WHITE,
    danger: 0xe5484d,
  },
  font: {
    /** Sage Peak is loaded in src/style.css and awaited in main.ts before any text is drawn. */
    family: '"Sage Peak", "Helvetica Neue", Arial, sans-serif',
    title: 72,
    situation: 46,
    situationMin: 30,
    choice: 34,
    choiceMin: 24,
    label: 24,
    header: 34,
  },
  layout: {
    margin: 60,
    hud: { top: 90, iconSize: 56, barWidth: 196, barHeight: 12, dotRadiusPerTen: 7 },
    title: { y: 280 },
    header: { y: 372 },
    card: { x: 80, y: 430, width: 920, height: 1420, radius: 44 },
    textBox: { inset: 50, top: 50, minHeight: 250, padding: 40, tiltDeg: -1.5 },
    /** Portrait picture panel (2:3 art fills it); `top` is measured from the card's top edge. */
    illustration: { top: 370, width: 560, height: 780, radius: 28, padding: 14 },
    choice: { width: 370, height: 170, bottom: 60, tiltDeg: 3 },
  },
} as const;
