// Curated catalogue of popular makes/models with stock specs. This powers the
// cascading Make -> Model -> Year -> Trim picker in the Garage. It is intentionally
// a small, hand-maintained set; anything not listed uses the "Other" manual entry.
// Specs are approximate stock figures and remain editable after selection.

export interface CarTrim {
  trim: string
  horsepower: number
  torque?: number
  weight_kg?: number
  fuel_type?: string
  transmission?: string
}

export interface CarModel {
  model: string
  yearStart: number
  yearEnd: number
  trims: CarTrim[]
}

export interface CarMake {
  make: string
  models: CarModel[]
}

const G = "Gasoline"
const E = "Electric"

export const CAR_CATALOG: CarMake[] = [
  {
    make: "Toyota",
    models: [
      { model: "GR Supra", yearStart: 2020, yearEnd: 2024, trims: [
        { trim: "2.0", horsepower: 255, torque: 295, weight_kg: 1395, fuel_type: G, transmission: "Automatic" },
        { trim: "3.0", horsepower: 382, torque: 368, weight_kg: 1542, fuel_type: G, transmission: "Automatic" },
      ] },
      { model: "GR86", yearStart: 2022, yearEnd: 2024, trims: [
        { trim: "Base", horsepower: 228, torque: 184, weight_kg: 1270, fuel_type: G, transmission: "Manual" },
      ] },
      { model: "Corolla", yearStart: 2014, yearEnd: 2024, trims: [
        { trim: "LE", horsepower: 139, torque: 126, weight_kg: 1310, fuel_type: G, transmission: "Automatic" },
        { trim: "GR", horsepower: 300, torque: 273, weight_kg: 1474, fuel_type: G, transmission: "Manual" },
      ] },
    ],
  },
  {
    make: "Honda",
    models: [
      { model: "Civic", yearStart: 2016, yearEnd: 2024, trims: [
        { trim: "Sport", horsepower: 180, torque: 177, weight_kg: 1330, fuel_type: G, transmission: "Manual" },
        { trim: "Type R", horsepower: 315, torque: 310, weight_kg: 1429, fuel_type: G, transmission: "Manual" },
      ] },
      { model: "Accord", yearStart: 2018, yearEnd: 2024, trims: [
        { trim: "Sport 2.0T", horsepower: 252, torque: 273, weight_kg: 1542, fuel_type: G, transmission: "Automatic" },
      ] },
    ],
  },
  {
    make: "Subaru",
    models: [
      { model: "WRX", yearStart: 2015, yearEnd: 2024, trims: [
        { trim: "Premium", horsepower: 271, torque: 258, weight_kg: 1535, fuel_type: G, transmission: "Manual" },
        { trim: "STI", horsepower: 310, torque: 290, weight_kg: 1600, fuel_type: G, transmission: "Manual" },
      ] },
      { model: "BRZ", yearStart: 2022, yearEnd: 2024, trims: [
        { trim: "Limited", horsepower: 228, torque: 184, weight_kg: 1277, fuel_type: G, transmission: "Manual" },
      ] },
    ],
  },
  {
    make: "BMW",
    models: [
      { model: "M3", yearStart: 2021, yearEnd: 2024, trims: [
        { trim: "Competition", horsepower: 503, torque: 479, weight_kg: 1730, fuel_type: G, transmission: "Automatic" },
      ] },
      { model: "M340i", yearStart: 2020, yearEnd: 2024, trims: [
        { trim: "xDrive", horsepower: 382, torque: 369, weight_kg: 1670, fuel_type: G, transmission: "Automatic" },
      ] },
      { model: "M2", yearStart: 2023, yearEnd: 2024, trims: [
        { trim: "Coupe", horsepower: 453, torque: 406, weight_kg: 1700, fuel_type: G, transmission: "Manual" },
      ] },
    ],
  },
  {
    make: "Mercedes-Benz",
    models: [
      { model: "A45 AMG", yearStart: 2020, yearEnd: 2024, trims: [
        { trim: "S", horsepower: 416, torque: 369, weight_kg: 1560, fuel_type: G, transmission: "Automatic" },
      ] },
      { model: "C63 AMG", yearStart: 2019, yearEnd: 2023, trims: [
        { trim: "S", horsepower: 503, torque: 516, weight_kg: 1765, fuel_type: G, transmission: "Automatic" },
      ] },
    ],
  },
  {
    make: "Audi",
    models: [
      { model: "RS3", yearStart: 2022, yearEnd: 2024, trims: [
        { trim: "Quattro", horsepower: 401, torque: 369, weight_kg: 1570, fuel_type: G, transmission: "Automatic" },
      ] },
      { model: "S4", yearStart: 2018, yearEnd: 2024, trims: [
        { trim: "Prestige", horsepower: 349, torque: 369, weight_kg: 1690, fuel_type: G, transmission: "Automatic" },
      ] },
    ],
  },
  {
    make: "Ford",
    models: [
      { model: "Mustang", yearStart: 2015, yearEnd: 2024, trims: [
        { trim: "EcoBoost", horsepower: 310, torque: 350, weight_kg: 1600, fuel_type: G, transmission: "Manual" },
        { trim: "GT", horsepower: 460, torque: 420, weight_kg: 1700, fuel_type: G, transmission: "Manual" },
      ] },
      { model: "Focus RS", yearStart: 2016, yearEnd: 2018, trims: [
        { trim: "RS", horsepower: 350, torque: 350, weight_kg: 1575, fuel_type: G, transmission: "Manual" },
      ] },
    ],
  },
  {
    make: "Chevrolet",
    models: [
      { model: "Camaro", yearStart: 2016, yearEnd: 2024, trims: [
        { trim: "SS", horsepower: 455, torque: 455, weight_kg: 1690, fuel_type: G, transmission: "Manual" },
        { trim: "ZL1", horsepower: 650, torque: 650, weight_kg: 1770, fuel_type: G, transmission: "Manual" },
      ] },
      { model: "Corvette", yearStart: 2020, yearEnd: 2024, trims: [
        { trim: "Stingray", horsepower: 495, torque: 470, weight_kg: 1530, fuel_type: G, transmission: "Automatic" },
      ] },
    ],
  },
  {
    make: "Nissan",
    models: [
      { model: "GT-R", yearStart: 2017, yearEnd: 2024, trims: [
        { trim: "Premium", horsepower: 565, torque: 467, weight_kg: 1752, fuel_type: G, transmission: "Automatic" },
      ] },
      { model: "Z", yearStart: 2023, yearEnd: 2024, trims: [
        { trim: "Performance", horsepower: 400, torque: 350, weight_kg: 1602, fuel_type: G, transmission: "Manual" },
      ] },
    ],
  },
  {
    make: "Volkswagen",
    models: [
      { model: "Golf GTI", yearStart: 2015, yearEnd: 2024, trims: [
        { trim: "Autobahn", horsepower: 241, torque: 273, weight_kg: 1455, fuel_type: G, transmission: "Manual" },
      ] },
      { model: "Golf R", yearStart: 2022, yearEnd: 2024, trims: [
        { trim: "Base", horsepower: 315, torque: 295, weight_kg: 1550, fuel_type: G, transmission: "Manual" },
      ] },
    ],
  },
  {
    make: "Porsche",
    models: [
      { model: "911", yearStart: 2020, yearEnd: 2024, trims: [
        { trim: "Carrera", horsepower: 379, torque: 331, weight_kg: 1505, fuel_type: G, transmission: "Automatic" },
        { trim: "Carrera S", horsepower: 443, torque: 390, weight_kg: 1515, fuel_type: G, transmission: "Automatic" },
      ] },
      { model: "718 Cayman", yearStart: 2017, yearEnd: 2024, trims: [
        { trim: "S", horsepower: 350, torque: 309, weight_kg: 1385, fuel_type: G, transmission: "Manual" },
      ] },
    ],
  },
  {
    make: "Tesla",
    models: [
      { model: "Model 3", yearStart: 2018, yearEnd: 2024, trims: [
        { trim: "Performance", horsepower: 510, torque: 487, weight_kg: 1844, fuel_type: E, transmission: "Single-speed" },
      ] },
      { model: "Model S", yearStart: 2021, yearEnd: 2024, trims: [
        { trim: "Plaid", horsepower: 1020, torque: 1050, weight_kg: 2162, fuel_type: E, transmission: "Single-speed" },
      ] },
    ],
  },
]

export const yearsForModel = (model: CarModel): number[] => {
  const years: number[] = []
  for (let y = model.yearEnd; y >= model.yearStart; y--) years.push(y)
  return years
}
