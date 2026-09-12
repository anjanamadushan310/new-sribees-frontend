/**
 * Code 128 barcode, drawn as inline SVG.
 *
 * A waybill has to be scannable off a printed sticker, and SribeesExpress does
 * not return a rendered label — their own label API returns fields and says the
 * barcode is drawn client-side from `waybill_id`, precisely so paper size and
 * printer model stay out of the API. So we draw it.
 *
 * Inline SVG rather than a canvas or an image: a canvas rasterises at screen
 * DPI and prints soft, which is how a scanner starts refusing a label. SVG
 * prints at the printer's own resolution, and its bars stay exactly the widths
 * the symbology requires.
 *
 * Code 128 subset B covers the printable ASCII range, which is everything a
 * waybill id contains (`SXP0000000002`). Subset C would pack digit pairs into
 * a shorter symbol, but a mixed alpha-numeric id cannot use it throughout and
 * switching sets mid-symbol buys nothing at this length.
 */
import React, { useMemo } from 'react';

/**
 * The 107 Code 128 symbols, as bar/space run lengths. Index = symbol value;
 * each string is six digits wide plus the stop pattern's extra bar. This is
 * the symbology's own table — it is data, not a thing to derive.
 */
const PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
    '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
    '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
    '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
    '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
    '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
    '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
    '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
    '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
    '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
    '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
    '211214', '211232', '233111',
];

const START_B = 104;
const STOP = 106;

/** Symbol values for `value` in subset B, with start, checksum and stop. */
function encode(value: string): number[] {
    const codes: number[] = [START_B];
    let checksum = START_B;
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i) - 32; // subset B: ASCII 32..126 -> 0..94
        if (code < 0 || code > 94) continue; // unencodable char: skip rather than corrupt
        codes.push(code);
        checksum += code * (i + 1);
    }
    codes.push(checksum % 103);
    codes.push(STOP);
    return codes;
}

interface Code128Props {
    value: string;
    /** Width of one narrow module in px. 2 prints reliably on a 203dpi label printer. */
    moduleWidth?: number;
    height?: number;
    /** Print the value under the bars — a human fallback when a scanner will not read. */
    showText?: boolean;
}

const Code128: React.FC<Code128Props> = ({
    value,
    moduleWidth = 2,
    height = 60,
    showText = true,
}) => {
    const { bars, width } = useMemo(() => {
        const out: { x: number; w: number }[] = [];
        let x = 0;
        for (const code of encode(value)) {
            const pattern = PATTERNS[code];
            for (let i = 0; i < pattern.length; i += 1) {
                const run = parseInt(pattern[i], 10) * moduleWidth;
                if (i % 2 === 0) out.push({ x, w: run }); // even index = bar
                x += run;
            }
        }
        // The stop pattern carries a final 2-module bar the run table does not.
        out.push({ x, w: 2 * moduleWidth });
        x += 2 * moduleWidth;
        return { bars: out, width: x };
    }, [value, moduleWidth]);

    const textHeight = showText ? 16 : 0;

    return (
        <svg
            width={width}
            height={height + textHeight}
            viewBox={`0 0 ${width} ${height + textHeight}`}
            // Scanners need white behind the bars; a themed background would
            // otherwise follow the page into the print.
            style={{ background: '#fff', display: 'block' }}
            role="img"
            aria-label={`Barcode ${value}`}
        >
            {bars.map((b, i) => (
                <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
            ))}
            {showText && (
                <text
                    x={width / 2}
                    y={height + 13}
                    textAnchor="middle"
                    fontSize={13}
                    fontFamily="monospace"
                    letterSpacing={1.5}
                    fill="#000"
                >
                    {value}
                </text>
            )}
        </svg>
    );
};

export default Code128;
