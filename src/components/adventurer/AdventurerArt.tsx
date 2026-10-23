import { memo } from "react";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { darken, hairColor, skinColor, type AdventurerLook } from "../../utils/adventurerLook";
import { levelLanternColors } from "../../utils/adventurerLook";

type Equipped = Partial<Record<string, string>>;

// One drawing for the person everywhere: Profile, Outfits, the profile
// picture and the reward screens. Each worn item is its own layer, so any
// mix of pieces works. Drawn on a 200 × 300 canvas; the portrait crop shows
// the head and shoulders only.
export default memo(function AdventurerArt({ look, equipped = {}, size, crop = "full", eyesClosed = false, lanternLevel = 0 }: {
  look: AdventurerLook; equipped?: Equipped; size: number; crop?: "full" | "portrait"; eyesClosed?: boolean; lanternLevel?: number;
}) {
  const skin = skinColor(look.skin), skinLine = darken(skin, 0.72);
  const hair = hairColor(look.hairColor), hairLine = darken(hair, 0.6), hairHi = darken(hair, 1.8);
  const top = equipped.top, portrait = crop === "portrait";
  const shirt = top === "cardigan" ? "#F2EEE6" : top === "overalls" ? "#F1EDE4" : top === "field_jacket" ? "#6B7550" : "#D9D4CA";
  const sleeve = top === "cardigan" ? "#B89C74" : top === "field_jacket" ? "#6B7550" : shirt;
  const pants = top === "overalls" ? "#4F6FA8" : top === "field_jacket" ? "#5B5A45" : "#3A3F4A";
  const shoe = equipped.shoes === "sneakers" ? "#E8E4DA" : equipped.shoes === "trail_boots" ? "#6B4429" : "#4A2E1E";
  const L = { strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const lantern = levelLanternColors(lanternLevel);
  return <Svg width={size} height={portrait ? size : size * 1.5} viewBox={portrait ? "38 12 124 124" : "0 0 200 300"} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {!portrait && <Ellipse cx={100} cy={288} rx={56} ry={7} fill="#000000" opacity={0.3} />}
    {!portrait && lantern && <G>
      <Ellipse cx={30} cy={285} rx={27} ry={4.4} fill={lantern.flame} opacity={0.35} />
      <Circle cx={30} cy={254} r={28} fill={lantern.flame} opacity={0.14} />
      <Circle cx={30} cy={210} r={4.5} fill="none" stroke={lantern.frame} strokeWidth={2.5} />
      <Path d="M12 232 L30 220 L48 232 Z" fill={lantern.frame} stroke={lantern.frameDark} strokeWidth={1.5} strokeLinejoin="round" />
      <Rect x={10} y={231} width={40} height={5} rx={2.5} fill={lantern.frame} />
      <Path d="M15 236 L45 236 L43 268 L17 268 Z" fill={lantern.flame} opacity={0.32} />
      <Path d="M30 241 Q20 253 30 264 Q40 253 30 241 Z" fill={lantern.flame} />
      <Path d="M30 248 Q25 255 30 261 Q35 255 30 248 Z" fill="#FFFFFF" opacity={0.9} />
      <Path d="M15 236 L17 268 M45 236 L43 268" stroke={lantern.frame} strokeWidth={3} strokeLinecap="round" />
      <Path d="M13 268 L47 268 L43 275 L17 275 Z" fill={lantern.frame} stroke={lantern.frameDark} strokeWidth={1.4} strokeLinejoin="round" />
      {lantern.gem && <Circle cx={30} cy={227} r={2.2} fill={lantern.flame} />}
    </G>}

    {/* Behind the body: cloak, long hair, braids and curls. */}
    {equipped.back === "forest_cloak" && <Path d="M60 122 Q50 200 44 256 Q100 266 156 256 Q150 200 140 122 Z" fill="#2F5A4E" stroke="#1C3A32" {...L} />}
    {look.hair === "long" && <Path d="M62 70 Q60 30 100 28 Q140 30 138 70 L142 150 Q100 160 58 150 Z" fill={hair} stroke={hairLine} {...L} />}
    {look.hair === "braids" && <G>
      <Path d="M66 80 L62 170 M134 80 L138 170" stroke={hairLine} strokeWidth={13} strokeLinecap="round" />
      <Path d="M66 80 L62 170 M134 80 L138 170" stroke={hair} strokeWidth={9} strokeLinecap="round" strokeDasharray="6 3" />
    </G>}
    {look.hair === "coily" && <G>
      <G fill={hair} stroke={hairLine} strokeWidth={2.2}>
        <Circle cx={64} cy={58} r={20} /><Circle cx={136} cy={58} r={20} /><Circle cx={80} cy={34} r={22} /><Circle cx={120} cy={34} r={22} />
        <Circle cx={100} cy={26} r={22} /><Circle cx={60} cy={84} r={16} /><Circle cx={140} cy={84} r={16} />
      </G>
      <Circle cx={100} cy={50} r={34} fill={hair} />
    </G>}
    {look.hair === "bun" && <Circle cx={100} cy={22} r={15} fill={hair} stroke={hairLine} {...L} />}

    {/* Legs and shoes. */}
    {!portrait && <G>
      <Path d="M76 196 L78 266 L97 266 L99 204 Z" fill={pants} stroke={darken(pants, 0.7)} {...L} />
      <Path d="M101 204 L103 266 L122 266 L124 196 Z" fill={pants} stroke={darken(pants, 0.7)} {...L} />
      <Path d="M74 262 L98 262 L98 280 Q98 286 92 286 L70 286 Q65 286 66 281 Q67 274 74 272 Z" fill={shoe} stroke={darken(shoe, 0.65)} {...L} />
      <Path d="M102 262 L126 262 L126 272 Q133 274 134 281 Q135 286 130 286 L108 286 Q102 286 102 280 Z" fill={shoe} stroke={darken(shoe, 0.65)} {...L} />
      {equipped.shoes === "trail_boots" && <Path d="M80 268 H94 M106 268 H120" stroke="#C9A06A" strokeWidth={2} />}
      {equipped.shoes === "sneakers" && <Path d="M72 278 H96 M104 278 H128" stroke="#F87171" strokeWidth={2.4} strokeLinecap="round" />}
    </G>}
    {equipped.held === "walking_staff" && <G>
      <Path d="M148 136 L152 286" stroke="#6B4429" strokeWidth={7} strokeLinecap="round" />
      <Path d="M148 136 L152 286" stroke="#8B5E3C" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={148} cy={134} r={5} fill="#C9A06A" />
    </G>}

    {/* The top. */}
    <Path d="M66 128 Q66 118 82 116 L118 116 Q134 118 134 128 L138 200 Q100 208 62 200 Z" fill={shirt} stroke={darken(shirt, 0.7)} {...L} />
    {top === "cardigan" && <G>
      <Path d="M66 128 Q66 118 82 116 L93 116 L100 152 L100 205 Q80 205 62 200 Z" fill="#B89C74" stroke="#7E6545" {...L} />
      <Path d="M134 128 Q134 118 118 116 L107 116 L100 152 L100 205 Q120 205 138 200 Z" fill="#B89C74" stroke="#7E6545" {...L} />
      <Path d="M70 186 Q84 190 98 188 M102 188 Q116 190 130 186" stroke="#9C8260" strokeWidth={2} fill="none" />
      <Circle cx={96} cy={164} r={2} fill="#5A4630" /><Circle cx={96} cy={178} r={2} fill="#5A4630" />
      <Path d="M88 116 L100 128 L92 134 Z M112 116 L100 128 L108 134 Z" fill="#FFFFFF" stroke="#C9C1B4" strokeWidth={1.6} strokeLinejoin="round" />
    </G>}
    {top === "overalls" && <G>
      <Path d="M70 134 H130 M69 146 H131" stroke="#2E3E66" strokeWidth={4} />
      <Path d="M80 140 L120 140 L123 204 Q100 208 77 204 Z" fill="#4F6FA8" stroke="#33508A" {...L} />
      <Path d="M80 141 L76 118 M120 141 L124 118" stroke="#4F6FA8" strokeWidth={6} strokeLinecap="round" />
      <Rect x={90} y={150} width={20} height={14} rx={3} fill="#5D7DB6" stroke="#33508A" strokeWidth={1.6} />
      <Circle cx={84} cy={180} r={3.5} fill="#F87171" /><Circle cx={114} cy={172} r={3} fill="#FBBF24" /><Circle cx={108} cy={192} r={2.5} fill="#34D399" />
    </G>}
    {top === "field_jacket" && <G>
      <Rect x={72} y={140} width={16} height={14} rx={3} fill="#5D6744" stroke="#424A2F" strokeWidth={1.6} />
      <Rect x={112} y={140} width={16} height={14} rx={3} fill="#5D6744" stroke="#424A2F" strokeWidth={1.6} />
      <Path d="M100 120 V204" stroke="#424A2F" strokeWidth={2} />
      <Path d="M86 116 L100 130 L114 116" stroke="#424A2F" strokeWidth={2} fill="none" />
    </G>}
    {equipped.neck === "tie" && <Path d="M98 126 L102 126 L104 150 L100 156 L96 150 Z" fill="#7A2E2E" />}

    {/* Arms, then what is held, then the hands. */}
    <Path d="M70 124 Q56 132 54 160 L52 192 L65 194 L68 162 Q70 146 76 138 Z" fill={sleeve} stroke={darken(sleeve, 0.7)} {...L} />
    <Path d="M130 124 Q144 132 146 160 L148 192 L135 194 L132 162 Q130 146 124 138 Z" fill={sleeve} stroke={darken(sleeve, 0.7)} {...L} />
    {top === "overalls" && <Path d="M56 150 L68 152 M58 172 L67 173 M144 150 L132 152 M142 172 L133 173" stroke="#2E3E66" strokeWidth={4} />}
    {equipped.held === "notebook" && <G rotation={-8} origin="142, 193">
      <Rect x={132} y={180} width={20} height={26} rx={2} fill="#7A2E2E" stroke="#4E1C1C" {...L} />
      <Path d="M136 184 L136 204" stroke="#E9D9B0" strokeWidth={2} />
    </G>}
    <Circle cx={58} cy={198} r={7} fill={skin} stroke={skinLine} {...L} />
    <Circle cx={142} cy={198} r={7} fill={skin} stroke={skinLine} {...L} />
    {equipped.bag === "book_bag" && <G>
      <Path d="M124 120 L74 190" stroke="#6B4429" strokeWidth={5} strokeLinecap="round" />
      <Rect x={50} y={182} width={30} height={24} rx={5} fill="#8A5A33" stroke="#5A3A20" {...L} />
      <Path d="M50 191 L80 191 L80 187 Q80 182 75 182 L55 182 Q50 182 50 187 Z" fill="#6B4429" />
      <Rect x={62} y={188} width={6} height={6} rx={1.5} fill="#D6A84A" />
    </G>}
    {equipped.bag === "tote" && <G>
      <Path d="M126 120 Q140 150 140 176" stroke="#C9B48E" strokeWidth={4} fill="none" />
      <Rect x={126} y={172} width={28} height={32} rx={4} fill="#E3D5B8" stroke="#B8A67F" {...L} />
      <Circle cx={134} cy={188} r={3} fill="#F87171" /><Circle cx={144} cy={194} r={2.4} fill="#60A5FA" />
    </G>}
    {equipped.back === "forest_cloak" && <G>
      <Path d="M72 110 Q100 128 128 110 Q136 126 122 134 Q100 142 78 134 Q64 126 72 110 Z" fill="#2F5A4E" stroke="#1C3A32" {...L} />
      <Circle cx={86} cy={130} r={3.4} fill="#D6A84A" /><Circle cx={114} cy={130} r={3.4} fill="#D6A84A" />
      <Path d="M89 130 Q100 134 111 130" stroke="#D6A84A" strokeWidth={1.6} fill="none" />
    </G>}

    {/* Neck, face and features. */}
    <Rect x={92} y={100} width={16} height={20} rx={5} fill={skin} stroke={skinLine} {...L} />
    {look.hair !== "long" && <G><Circle cx={65} cy={76} r={7} fill={skin} stroke={skinLine} {...L} /><Circle cx={135} cy={76} r={7} fill={skin} stroke={skinLine} {...L} /></G>}
    <Path d="M66 66 Q66 34 100 34 Q134 34 134 66 Q134 98 116 108 Q100 115 84 108 Q66 98 66 66 Z" fill={skin} stroke={skinLine} {...L} />
    <Path d="M120 50 Q136 74 118 106 Q130 76 120 50 Z" fill={skinLine} opacity={0.16} />
    <Path d="M78 69 Q85 65 92 68 M108 68 Q115 65 122 69" stroke={hairLine} strokeWidth={2.6} fill="none" strokeLinecap="round" />
    {eyesClosed
      ? <Path d="M80 79 Q85 82 90 79 M110 79 Q115 82 120 79" stroke="#2A2433" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      : <G>
        <Path d="M79 77 Q85 72 91 77 M109 77 Q115 72 121 77" stroke="#2A2433" strokeWidth={2} fill="none" strokeLinecap="round" />
        <Ellipse cx={85} cy={79} rx={3.6} ry={4.4} fill="#2A2433" /><Ellipse cx={115} cy={79} rx={3.6} ry={4.4} fill="#2A2433" />
        <Circle cx={86.4} cy={77.4} r={1.2} fill="#FFFFFF" /><Circle cx={116.4} cy={77.4} r={1.2} fill="#FFFFFF" />
      </G>}
    <Path d="M100 82 Q103 89 99 91" stroke={skinLine} strokeWidth={2} fill="none" strokeLinecap="round" />
    <Path d="M93 99 Q100 103 107 99" stroke="#8A3F35" strokeWidth={2.4} fill="none" strokeLinecap="round" />
    <Ellipse cx={79} cy={92} rx={5} ry={3} fill="#E8838A" opacity={0.22} /><Ellipse cx={121} cy={92} rx={5} ry={3} fill="#E8838A" opacity={0.22} />

    {/* Hair in front. */}
    {look.hair === "short" && <G>
      <Path d="M64 74 Q60 30 100 28 Q140 30 136 74 Q132 56 122 50 Q110 56 92 52 Q80 50 72 58 Q66 64 64 74 Z" fill={hair} stroke={hairLine} {...L} />
      <Path d="M76 40 Q90 32 106 33" stroke={hairHi} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.6} />
    </G>}
    {look.hair === "long" && <G>
      <Path d="M64 84 Q58 30 100 28 Q142 30 136 84 Q134 62 122 52 Q112 46 100 44 Q88 46 78 52 Q66 62 64 84 Z" fill={hair} stroke={hairLine} {...L} />
      <Path d="M100 30 L100 44" stroke={hairLine} strokeWidth={2} />
      <Path d="M78 38 Q88 33 96 33" stroke={hairHi} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.6} />
    </G>}
    {look.hair === "braids" && <G>
      <Path d="M66 70 Q62 30 100 28 Q138 30 134 70 Q128 50 112 46 L100 48 L88 46 Q72 50 66 70 Z" fill={hair} stroke={hairLine} {...L} />
      <Path d="M100 30 L100 48 M84 34 L80 50 M116 34 L120 50" stroke={hairLine} strokeWidth={1.8} opacity={0.8} />
    </G>}
    {look.hair === "coily" && <G fill={hair}>
      <Circle cx={76} cy={52} r={10} /><Circle cx={90} cy={46} r={10} /><Circle cx={104} cy={45} r={10} />
      <Circle cx={118} cy={48} r={10} /><Circle cx={128} cy={56} r={9} /><Circle cx={70} cy={62} r={8} />
    </G>}
    {look.hair === "bun" && <G>
      <Path d="M64 76 Q60 30 100 30 Q140 30 136 76 Q130 52 116 46 Q104 52 94 48 Q78 48 70 60 Q66 66 64 76 Z" fill={hair} stroke={hairLine} {...L} />
      <Path d="M66 70 Q62 84 66 96" stroke={hair} strokeWidth={3} fill="none" strokeLinecap="round" />
    </G>}
    {(look.glasses || equipped.face === "glasses") && <G>
      <Circle cx={85} cy={79} r={10} fill="#DCE6F2" fillOpacity={0.14} stroke="#3A3A46" strokeWidth={2.4} />
      <Circle cx={115} cy={79} r={10} fill="#DCE6F2" fillOpacity={0.14} stroke="#3A3A46" strokeWidth={2.4} />
      <Path d="M95 78 Q100 74 105 78" stroke="#3A3A46" strokeWidth={2.4} fill="none" />
    </G>}
    {equipped.head === "beret" && <G rotation={-12} origin="94, 36">
      <Ellipse cx={94} cy={36} rx={38} ry={12} fill="#C2453A" stroke="#8E2C24" {...L} />
      <Ellipse cx={86} cy={32} rx={16} ry={4} fill="#D65A4E" />
      <Rect x={96} y={18} width={5} height={9} rx={2.5} fill="#8E2C24" />
    </G>}
  </Svg>;
});
