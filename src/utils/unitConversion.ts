/**
 * Unit Conversion Utility
 * Handles conversion between compatible units (weight and volume)
 */

// Unit categories
export type UnitCategory = 'weight' | 'volume' | 'none';

// Unit conversion configuration
interface UnitConversion {
  category: UnitCategory;
  toBase: number; // Conversion factor to base unit
}

// Conversion factors to base unit (kg for weight, liter for volume)
const UNIT_CONVERSIONS: Record<string, UnitConversion> = {
  // Weight (base: kg)
  'kg': { category: 'weight', toBase: 1 },
  'g': { category: 'weight', toBase: 0.001 },
  'mg': { category: 'weight', toBase: 0.000001 },
  'lb': { category: 'weight', toBase: 0.453592 },
  'ounce': { category: 'weight', toBase: 0.0283495 },
  
  // Volume (base: liter)
  'liter': { category: 'volume', toBase: 1 },
  'ml': { category: 'volume', toBase: 0.001 },
  'gallon': { category: 'volume', toBase: 3.78541 },
  'quart': { category: 'volume', toBase: 0.946353 },
  'pint': { category: 'volume', toBase: 0.473176 },
  
  // Non-convertible units (treated as "each")
  'each': { category: 'none', toBase: 1 },
  'hour': { category: 'none', toBase: 1 },
  'meter': { category: 'none', toBase: 1 },
  'cm': { category: 'none', toBase: 1 },
  'mm': { category: 'none', toBase: 1 },
  'sq meter': { category: 'none', toBase: 1 },
  'sq foot': { category: 'none', toBase: 1 },
  'cubic meter': { category: 'none', toBase: 1 },
  'cubic foot': { category: 'none', toBase: 1 },
  'box': { category: 'none', toBase: 1 },
  'pack': { category: 'none', toBase: 1 },
  'pair': { category: 'none', toBase: 1 },
  'roll': { category: 'none', toBase: 1 },
  'set': { category: 'none', toBase: 1 },
  'sheet': { category: 'none', toBase: 1 },
  'unit': { category: 'none', toBase: 1 },
};

/**
 * Get the category of a unit
 */
export function getUnitCategory(unit: string): UnitCategory {
  const conversion = UNIT_CONVERSIONS[unit];
  return conversion ? conversion.category : 'none';
}

/**
 * Check if two units can be converted between each other
 */
export function canConvert(fromUnit: string, toUnit: string): boolean {
  if (fromUnit === toUnit) return true;
  
  const fromConversion = UNIT_CONVERSIONS[fromUnit];
  const toConversion = UNIT_CONVERSIONS[toUnit];
  
  if (!fromConversion || !toConversion) return false;
  
  // Can only convert within the same category
  return fromConversion.category === toConversion.category && 
         fromConversion.category !== 'none';
}

/**
 * Convert a value from one unit to another
 * Returns the original value if conversion is not possible
 */
export function convertUnits(value: number, fromUnit: string, toUnit: string): number {
  // No conversion needed if units are the same
  if (fromUnit === toUnit) return value;
  
  const fromConversion = UNIT_CONVERSIONS[fromUnit];
  const toConversion = UNIT_CONVERSIONS[toUnit];
  
  // Return original value if conversion is not possible
  if (!canConvert(fromUnit, toUnit)) {
    console.warn(`Cannot convert from ${fromUnit} to ${toUnit}`);
    return value;
  }
  
  // Convert to base unit, then to target unit
  const baseValue = value * fromConversion.toBase;
  const convertedValue = baseValue / toConversion.toBase;
  
  return convertedValue;
}

/**
 * Get all units that are compatible (convertible) with a given unit
 */
export function getCompatibleUnits(unit: string): string[] {
  const category = getUnitCategory(unit);
  
  if (category === 'none') {
    // Non-convertible units can only use themselves
    return [unit];
  }
  
  // Return all units in the same category
  return Object.entries(UNIT_CONVERSIONS)
    .filter(([_, conversion]) => conversion.category === category)
    .map(([unitName]) => unitName);
}

/**
 * Get all available units (for dropdown menus)
 */
export function getAllUnits(): string[] {
  return Object.keys(UNIT_CONVERSIONS);
}

/**
 * Format a unit display string (e.g., "per kg", "per liter")
 */
export function formatUnitDisplay(unit: string, showPer: boolean = false): string {
  return showPer ? `per ${unit}` : unit;
}



