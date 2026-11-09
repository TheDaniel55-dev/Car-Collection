// Brand detection from a casting name ("'20 Toyota GR Supra" -> "Toyota").
export const BRANDS = [
  'Alfa Romeo', 'Aston Martin', 'Land Rover', 'Rolls-Royce', 'Mercedes-Benz', 'Mercedes', 'Acura', 'Audi', 'Bentley',
  'BMW', 'Bugatti', 'Buick', 'Cadillac', 'Chevrolet', 'Chevy', 'Chrysler', 'Citroen', 'Datsun', 'DeLorean', 'DMC', 'Dodge', 'Ferrari',
  'Fiat', 'Ford', 'GMC', 'Honda', 'Hummer', 'Hyundai', 'Infiniti', 'Isuzu', 'Jaguar', 'Jeep', 'Koenigsegg', 'Lamborghini',
  'Lancia', 'Lexus', 'Lincoln', 'Lotus', 'Maserati', 'Mazda', 'McLaren', 'Mercury', 'MG', 'Mini', 'Mitsubishi',
  'Morris', 'Nissan', 'Oldsmobile', 'Opel', 'Pagani', 'Peugeot', 'Plymouth', 'Pontiac', 'Porsche', 'Ram', 'Renault',
  'Rimac', 'Saab', 'Scion', 'Shelby', 'Skoda', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'VW', 'Volvo', 'Tucker',
  'AMC', 'Rivian', 'Polestar', 'Genesis', 'Kia', 'Mack', 'Kenworth', 'Peterbilt', 'Freightliner', 'Harley-Davidson', 'Ducati', 'Kawasaki', 'Yamaha',
];
const SORTED = [...BRANDS].sort((a, b) => b.length - a.length);
const ALIAS = { Chevy: 'Chevrolet', VW: 'Volkswagen', Mercedes: 'Mercedes-Benz', DMC: 'DeLorean' };

export function brandOf(name) {
  const s = String(name ?? '').replace(/^['’]?\d{2,4}\s+/, '').replace(/^custom\s+|^toon'?d\s+|^lb[\s-]?(works|super silhouette)?\s*/i, '');
  const low = s.toLowerCase();
  for (const b of SORTED) {
    const bl = b.toLowerCase();
    if (low === bl || low.startsWith(bl + ' ') || low.startsWith(bl + '-')) return ALIAS[b] || b;
  }
  const w = s.split(/\s+/)[0] || '';
  return w ? w[0].toUpperCase() + w.slice(1) : 'Other';
}

// Categories used in onboarding to personalise suggestions.
export const CATEGORIES = {
  jdm: { brands: ['Toyota', 'Nissan', 'Honda', 'Mazda', 'Subaru', 'Mitsubishi', 'Datsun', 'Lexus', 'Suzuki', 'Acura', 'Infiniti', 'Isuzu'], kw: ['skyline', 'supra', 'civic', 'rx-7', 'rx7', 'jdm', 'silvia', 'gt-r'] },
  european: { brands: ['Audi', 'BMW', 'Porsche', 'Mercedes-Benz', 'Volkswagen', 'Volvo', 'Fiat', 'Alfa Romeo', 'Renault', 'Peugeot', 'Citroen', 'Opel', 'Jaguar', 'Mini', 'Saab', 'Skoda', 'Lancia'], kw: [] },
  muscle: { brands: ['Ford', 'Chevrolet', 'Dodge', 'Plymouth', 'Pontiac', 'Buick', 'Oldsmobile', 'AMC', 'Mercury', 'Shelby'], kw: ['mustang', 'camaro', 'charger', 'challenger', 'chevelle', 'barracuda', 'gto', 'corvette'] },
  exotics: { brands: ['Lamborghini', 'Ferrari', 'McLaren', 'Bugatti', 'Koenigsegg', 'Pagani', 'Aston Martin', 'Lotus', 'Maserati', 'Rimac', 'Bentley', 'Rolls-Royce'], kw: ['hw exotics'] },
  trucks: { brands: ['Jeep', 'Land Rover', 'Ram', 'GMC', 'Hummer', 'Mack', 'Kenworth', 'Peterbilt', 'Freightliner'], kw: ['truck', 'pickup', 'bronco', 'raptor', 'baja', 'off-road', '4x4', 'cruiser', 'hilux', 'silverado', 'f-150', 'monster'] },
  racing: { brands: [], kw: ['race', 'racing', 'livery', 'le mans', 'rally', 'nascar', 'drift', 'speed machines', 'gt3', 'gt40', 'imsa', 'hw race'] },
  fantasy: { brands: [], kw: ['twin mill', 'bone shaker', 'rodger dodger', 'sharkruiser', 'fantasy', 'whip creamer', 'deora', 'rip rod', 'gotta go'] },
  classics: { brands: ['Datsun', 'Morris', 'Tucker'], kw: ['hot rod', "'32", "'34", "'40", "'48", "'55", "'57", "'59", "'63", "'64", "'65", "'66", "'67", "'68", "'69", "'70", 'vintage', 'classic', 'redline'] },
  movie: { brands: ['DeLorean'], kw: ['batmobile', 'back to the future', 'fast & furious', 'star wars', 'ghostbusters', 'batman', 'marvel', 'jurassic', 'knight rider', 'ecto', 'dmc', 'bttf', 'hw screen time'] },
};
