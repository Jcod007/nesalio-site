/**
 * Moteur de placement du tableau : l'IA dit « quoi », le moteur décide « où ».
 * Fonctions pures, en coordonnées mathématiques. Ce module rassemble :
 * - measure : échelle du repère et taille des textes ;
 * - ticks : graduations des axes ;
 * - boxes, nodeBoxes : boîtes englobantes et ce qu'occupe chaque objet ;
 * - occupancy : empreintes et encombrement du tableau ;
 * - placement : où poser textes et étiquettes, faire de la place ;
 * - calc : la pile de calculs.
 *
 * Seule cette liste sort du module : les aides internes (shift, padded…) restent privées.
 */
export {
  AXES_BOX,
  FONT_SIZE,
  UNIFORM_RATIO,
  fontSizeOf,
  isUniform,
  mathSize,
  matrixLayout,
  scales,
  textExtent,
  textNodeExtent,
  textWorldExtent,
  worldPerMath,
  type Box,
  type Extent,
} from "./measure";
export { TICK_FONT, axisTicks, tickLabels, tickText, type AxisTicks } from "./ticks";
export { boxAround, boxCenter, boxExtent, intersects, union } from "./boxes";
export { bodyBox, contentBox, defaultLabelCenter, figureBox, labelBox, labelCenter, nodeBox, outline } from "./nodeBoxes";
export { AXES_OWNER, crowding, footprints, obstacles, regionCover, type Footprints, type Part } from "./occupancy";
export { fitFrame, followAnchors, makeWay, namingRegions, placeBeside, placeLabel, placeNear, placeText } from "./placement";
export { calcColumn, calcFlow, makeRoomInCalc, nextCalcSlot, reflowCalc } from "./calc";
