import { useCallback, useEffect, useState } from "react"
import { useAppStore } from "../store"
import { user as userApi, vehicles as vehiclesApi } from "../api"
import { VehicleForm, VehiclePayload } from "../components/VehicleForm"
import { Car, Check, Plus, Trash2 } from "lucide-react"

interface Vehicle {
  id: number
  manufacturer: string
  model: string
  year: number
  horsepower: number
  torque?: number
  transmission?: string
  is_active: boolean
}

export const GarageScreen = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const setUser = useAppStore((s) => s.setUser)
  const setStoreVehicles = useAppStore((s) => s.setVehicles)

  const load = useCallback(async () => {
    try {
      const res = await vehiclesApi.list()
      setVehicles(res.data)
      setStoreVehicles(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [setStoreVehicles])

  useEffect(() => {
    load()
  }, [load])

  const hasActive = vehicles.some((v) => v.is_active)

  const handleCreate = async (payload: VehiclePayload) => {
    setSaving(true)
    setError("")
    try {
      const created = await vehiclesApi.create(payload)
      if (!hasActive) await vehiclesApi.activate(created.data.id)
      setShowAdd(false)
      await load()
      const profile = await userApi.getProfile()
      setUser(profile.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to add vehicle")
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async (id: number) => {
    try {
      await vehiclesApi.activate(id)
      await load()
      const profile = await userApi.getProfile()
      setUser(profile.data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    setError("")
    try {
      await vehiclesApi.remove(id)
      setConfirmId(null)
      await load()
      // Deleting the active car reassigns it server-side, so refresh the profile.
      const profile = await userApi.getProfile()
      setUser(profile.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to delete vehicle")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-end justify-between gap-3 mb-6">
        <div>
          <span className="eyebrow">Garage</span>
          <h2 className="display text-5xl mt-2">Your vehicles</h2>
        </div>
        <button onClick={() => setShowAdd((s) => !s)} className="pressable btn-primary flex items-center gap-2">
          <Plus size={18} />
          {showAdd ? "Close" : "Add vehicle"}
        </button>
      </div>

      {!hasActive && !loading && (
        <div className="card mb-6 border-amber/40 text-amber text-sm">
          You need an active vehicle to create or join a sprint. Add one and set it active below.
        </div>
      )}

      {showAdd && (
        <div className="mb-6">
          <VehicleForm onCreate={handleCreate} saving={saving} error={error} />
        </div>
      )}

      {error && !showAdd && (
        <div className="card mb-6 border-negative/40 text-negative text-sm">{error}</div>
      )}

      <div className="card">
        <div className="flex items-center gap-2 mb-4 font-semibold">
          <Car size={18} className="text-white/50" />
          Garage <span className="stat-num text-white/45">({vehicles.length})</span>
        </div>
        {loading ? (
          <p className="text-white/60 text-sm">Loading…</p>
        ) : vehicles.length === 0 ? (
          <p className="text-white/60 text-sm">No vehicles yet — add one above.</p>
        ) : (
          <ul className="space-y-2">
            {vehicles.map((v) => (
              <li key={v.id} className="flex items-center justify-between bg-ink-2 border border-hairline rounded-lg px-4 py-3">
                <div>
                  <strong className="block">{v.year} {v.manufacturer} {v.model}</strong>
                  <span className="text-xs text-white/60">
                    {v.horsepower} hp{v.torque ? ` · ${v.torque} lb-ft` : ""}{v.transmission ? ` · ${v.transmission}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {v.is_active ? (
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded font-bold bg-positive/20 text-positive">
                      <Check size={14} /> Active
                    </span>
                  ) : (
                    <button onClick={() => handleActivate(v.id)} className="tap pressable btn-secondary px-3 py-1.5 text-sm">
                      Set active
                    </button>
                  )}
                  {confirmId === v.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(v.id)}
                        disabled={deletingId === v.id}
                        className="tap pressable rounded bg-negative/20 px-2.5 py-1.5 text-xs font-bold text-negative hover:bg-negative/30 disabled:opacity-50"
                      >
                        {deletingId === v.id ? "Deleting…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="tap pressable rounded px-2.5 py-1.5 text-xs text-white/60 hover:text-white"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(v.id)}
                      title="Delete vehicle"
                      className="tap pressable rounded-lg p-2 text-white/50 transition-colors hover:bg-negative/10 hover:text-negative"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
