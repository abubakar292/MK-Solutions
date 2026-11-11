import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import Decimal from 'decimal.js';
import { roundMoney, roundWeight, toDecimal } from '../domain/engine';

export const KARACHI_TZ = 'Asia/Karachi';

/**
 * Format PKR currency in en-PK locale.
 * Examples:
 * - Rs 1,250,000
 * - Rs 1,250,000.50 (shows 2 decimals when fractional or when alwaysShowDecimals is true)
 */
export function formatMoney(
  value: Decimal.Value | undefined | null,
  options?: { alwaysShowDecimals?: boolean; withPrefix?: boolean }
): string {
  const rounded = roundMoney(value ?? 0);
  const isNegative = rounded.isNegative();
  const absVal = rounded.abs();
  const hasCents = !absVal.mod(1).eq(0);
  const showDecimals = options?.alwaysShowDecimals || hasCents;

  const formattedNumber = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(absVal.toNumber());

  const prefix = options?.withPrefix === false ? '' : 'Rs ';
  return `${isNegative ? '-' : ''}${prefix}${formattedNumber}`;
}

/**
 * Show weights in tons with up to 3 decimals, trimming trailing zeros (12.5, 9.95, 10.025).
 * Never shows kg.
 */
export function formatTon(
  value: Decimal.Value | undefined | null,
  options?: { withUnit?: boolean }
): string {
  const rounded = roundWeight(value ?? 0);
  const trimmed = rounded.toDecimalPlaces(3).toString();
  const numPart = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(trimmed));

  return options?.withUnit === false ? numPart : `${numPart} ton`;
}

/**
 * Show chemical or dispatch bag count (up to 3 decimals trimmed, typically integer).
 * Never shows kg.
 */
export function formatBags(
  value: Decimal.Value | undefined | null,
  options?: { withUnit?: boolean }
): string {
  const rounded = roundWeight(value ?? 0);
  const num = rounded.toNumber();
  const numPart = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(num);

  if (options?.withUnit === false) return numPart;
  const unit = Math.abs(num) === 1 ? 'bag' : 'bags';
  return `${numPart} ${unit}`;
}

function parseToKarachiDate(dateInput: string | Date): Date {
  const d = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    return new Date();
  }
  return toZonedTime(d, KARACHI_TZ);
}

export function formatDate(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return '—';
  // If YYYY-MM-DD plain date, format directly without timezone shift
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    return format(localDate, 'dd MMM yyyy');
  }
  const zoned = parseToKarachiDate(dateInput);
  return format(zoned, 'dd MMM yyyy');
}

export function formatDateTime(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return '—';
  const zoned = parseToKarachiDate(dateInput);
  return format(zoned, 'dd MMM yyyy, hh:mm a');
}

export function getTodayKarachiIsoDate(): string {
  const zoned = toZonedTime(new Date(), KARACHI_TZ);
  return format(zoned, 'yyyy-MM-dd');
}

export function getNowKarachiIsoDateTime(): string {
  const zoned = toZonedTime(new Date(), KARACHI_TZ);
  return format(zoned, "yyyy-MM-dd'T'HH:mm");
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function convertLessThanThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const rem = n % 10;
    return `${TENS[t]}${rem > 0 ? ` ${ONES[rem]}` : ''}`;
  }
  const h = Math.floor(n / 100);
  const rem = n % 100;
  return `${ONES[h]} Hundred${rem > 0 ? ` and ${convertLessThanThousand(rem)}` : ''}`;
}

/**
 * Convert PKR numeric amount into South Asian English words (Crore, Lakh, Thousand, Rupees, Paisa).
 */
export function amountInWords(value: Decimal.Value | undefined | null): string {
  const dec = roundMoney(toDecimal(value ?? 0)).abs();
  const whole = dec.floor().toNumber();
  const paisa = dec.minus(whole).times(100).round().toNumber();

  if (whole === 0 && paisa === 0) {
    return 'Rupees Zero Only';
  }

  let remaining = whole;
  const parts: string[] = [];

  const crores = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  if (crores > 0) {
    parts.push(`${convertLessThanThousand(crores)} Crore`);
  }

  const lakhs = Math.floor(remaining / 100000);
  remaining %= 100000;
  if (lakhs > 0) {
    parts.push(`${convertLessThanThousand(lakhs)} Lakh`);
  }

  const thousands = Math.floor(remaining / 1000);
  remaining %= 1000;
  if (thousands > 0) {
    parts.push(`${convertLessThanThousand(thousands)} Thousand`);
  }

  if (remaining > 0) {
    parts.push(convertLessThanThousand(remaining));
  }

  const rupeesPart = parts.length > 0 ? `Rupees ${parts.join(' ')}` : 'Rupees Zero';
  const paisaPart = paisa > 0 ? ` and ${convertLessThanThousand(paisa)} Paisa` : '';

  return `${rupeesPart}${paisaPart} Only`;
}
