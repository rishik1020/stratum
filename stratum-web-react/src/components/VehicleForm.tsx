import { useMemo, useState } from "react"
import { CAR_CATALOG, CarTrim, yearsForModel } from "../data/cars"

export interface VehiclePayload {
  manufacturer: string
  model: string
  year: number
  horsepower: number
  torque?: number
  fuel_type?: string
  transmission?: string
  weight_kg?: number
}

const OTHER = "__other__"
const selectClass =
  "w-full bg-ink-2 border border-hairline rounded-xl px-3 py-2 text-white outline-none focus:border-white/25 transition-colors placeholder:text-white/30"

export const VehicleForm = ({
  onCreate,
  saving,
  error,
}: {
  onCreate: (payload: VehiclePayload) => void
  saving: boolean
  error?: string
}) => {
  const [makeName, setMakeName] = useState("")
  const [modelName, setModelName] = useState("")
  const [year, setYear] = useState<number | "">("")
  const [trimName, setTrimName] = useState("")

  // Manual-entry fields (used when make is "Other").
  const [manualMake, setManualMake] = useState("")
  const [manualModel, setManualModel] = useState("")

  // Editable specs (autofilled from a chosen trim but always overridable).
  const [horsepower, setHorsepower] = useState<number | "">("")
  const [torque, setTorque] = useState<number | "">("")
  const [fuelType, setFuelType] = useState("")
  const [transmission, setTransmission] = useState("")
  const [weight, setWeight] = useState<number | "">("")

  const isManual = makeName === OTHER

  const make = useMemo(() => CAR_CATALOG.find((m) => m.make === makeName), [makeName])
  const model = useMemo(() => make?.models.find((m) => m.model === modelName), [make, modelName])
  const years = useMemo(() => (model ? yearsForModel(model) : []), [model])

  const applyTrim = (trim?: CarTrim) => {
    if (!trim) return
    setHorsepower(trim.horsepower)
    setTorque(trim.torque ?? "")
    setFuelType(trim.fuel_type ?? "")
    setTransmission(trim.transmission ?? "")
    setWeight(trim.weight_kg ?? "")
  }

  const handleMake = (value: string) => {
    setMakeName(value)
    setModelName("")
    setYear("")
    setTrimName("")
  }

  const handleModel = (value: string) => {
    setModelName(value)
    const m = make?.models.find((x) => x.model === value)
    setYear(m ? m.yearEnd : "")
    setTrimName("")
    // Auto-apply if there is only one trim.
    if (m && m.trims.length === 1) {
      setTrimName(m.trims[0].trim)
      applyTrim(m.trims[0])
    }
  }

  const handleTrim = (value: string) => {
    setTrimName(value)
    applyTrim(model?.trims.find((t) => t.trim === value))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const manufacturer = isManual ? manualMake.trim() : makeName
    const finalModel = isManual ? manualModel.trim() : modelName
    const finalYear = isManual ? Number(year) : Number(year)
    if (!manufacturer || !finalModel || !finalYear || !horsepower) return
    onCreate({
      manufacturer,
      model: finalModel,
      year: finalYear,
      horsepower: Number(horsepower),
      torque: torque === "" ? undefined : Number(torque),
      fuel_type: fuelType || undefined,
      transmission: transmission || undefined,
      weight_kg: weight === "" ? undefined : Number(weight),
    })
  }

  return (
    <form onSubmit={submit} className="bg-ink-1 border border-hairline rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-white/50">Make</label>
          <select value={makeName} onChange={(e) => handleMake(e.target.value)} className={selectClass} required>
            <option value="" className="bg-ink">Select make…</option>
            {CAR_CATALOG.map((m) => (
              <option key={m.make} value={m.make} className="bg-ink">{m.make}</option>
            ))}
            <option value={OTHER} className="bg-ink">Other (type manually)</option>
          </select>
        </div>

        {isManual ? (
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Make name</label>
            <input value={manualMake} onChange={(e) => setManualMake(e.target.value)} placeholder="e.g. Lotus" className={selectClass} required />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Model</label>
            <select value={modelName} onChange={(e) => handleModel(e.target.value)} className={selectClass} disabled={!make} required>
              <option value="" className="bg-ink">{make ? "Select model…" : "Pick a make first"}</option>
              {make?.models.map((m) => (
                <option key={m.model} value={m.model} className="bg-ink">{m.model}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isManual ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Model</label>
            <input value={manualModel} onChange={(e) => setManualModel(e.target.value)} placeholder="e.g. Emira" className={selectClass} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Year</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} placeholder="2022" className={selectClass} required />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass} disabled={!model} required>
              <option value="" className="bg-ink">{model ? "Select year…" : "Pick a model first"}</option>
              {years.map((y) => (
                <option key={y} value={y} className="bg-ink">{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Trim</label>
            <select value={trimName} onChange={(e) => handleTrim(e.target.value)} className={selectClass} disabled={!model} required>
              <option value="" className="bg-ink">{model ? "Select trim…" : "Pick a model first"}</option>
              {model?.trims.map((t) => (
                <option key={t.trim} value={t.trim} className="bg-ink">{t.trim} · {t.horsepower} hp</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="border-t border-hairline pt-3">
        <p className="text-xs text-white/50 mb-2">Specs {!isManual && "(autofilled — edit if your car is modified)"}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Horsepower</label>
            <input type="number" value={horsepower} onChange={(e) => setHorsepower(e.target.value === "" ? "" : Number(e.target.value))} placeholder="hp" className={selectClass} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Torque (lb-ft)</label>
            <input type="number" value={torque} onChange={(e) => setTorque(e.target.value === "" ? "" : Number(e.target.value))} placeholder="optional" className={selectClass} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Transmission</label>
            <input value={transmission} onChange={(e) => setTransmission(e.target.value)} placeholder="optional" className={selectClass} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-white/50">Weight (kg)</label>
            <input type="number" value={weight} onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))} placeholder="optional" className={selectClass} />
          </div>
        </div>
      </div>

      {error && <p className="text-negative text-sm">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full disabled:opacity-50">
        {saving ? "Saving…" : "Add to garage"}
      </button>
    </form>
  )
}
