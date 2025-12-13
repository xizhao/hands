/**
 * @component aspect-ratio
 * @name Aspect Ratio
 * @category ui-layout
 * @description Keep content at a specific width-to-height ratio.
 * @icon ratio
 * @keywords aspect, ratio, responsive
 * @example
 * <AspectRatio ratio={16 / 9}>
 *   <img src="photo.jpg" alt="Photo" />
 * </AspectRatio>
 */
import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";

const AspectRatio = AspectRatioPrimitive.Root;

export { AspectRatio };
