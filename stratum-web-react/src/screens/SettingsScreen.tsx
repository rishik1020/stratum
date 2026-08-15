import { useEffect, useState } from "react"
import { Camera } from "lucide-react"
import { useAppStore } from "../store"
import { user as userApi } from "../api"
import { initials } from "../lib/format"

const inputClass =
  "w-full bg-ink-2 border border-hairline rounded-xl px-4 py-2.5 text-white outline-none focus:border-white/25 transition-colors placeholder:text-white/30"

export const SettingsScreen = () => {
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const units = useAppStore((s) => s.units)
  const setUnits = useAppStore((s) => s.setUnits)

  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [pic, setPic] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "")
      setBio(user.bio || "")
      setPic(user.profile_picture_url || "")
    }
  }, [user])

  // Read the chosen image, square-crop + downscale to 256px via canvas, and store
  // it as a JPEG data URL in profile_picture_url — no separate file storage needed.
  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // let the same file be re-picked later
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const size = 256
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        setPic(canvas.toDataURL("image/jpeg", 0.82))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError("")
    try {
      const res = await userApi.updateProfile({
        display_name: displayName,
        bio,
        profile_picture_url: pic || null,
      })
      setUser(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6 md:mb-8">
        <span className="eyebrow">Settings</span>
        <h2 className="display text-4xl md:text-5xl mt-2">Options</h2>
      </div>

      <form onSubmit={handleSave} className="card space-y-5 mb-6">
        <h3 className="font-semibold">Profile</h3>

        <div>
          <label className="block text-xs font-medium text-white/50 mb-2">Profile picture</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden border border-white/15 bg-ink-2 flex items-center justify-center shrink-0">
              {pic ? (
                <img src={pic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-medium text-white/55">{initials(displayName || user?.username)}</span>
              )}
            </div>
            <div className="flex flex-col gap-2 items-start">
              <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                <Camera size={16} />
                {pic ? "Change photo" : "Upload photo"}
                <input type="file" accept="image/*" onChange={onPickImage} className="hidden" />
              </label>
              {pic && (
                <button type="button" onClick={() => setPic("")} className="text-xs text-white/45 hover:text-white/80">
                  Remove photo
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-white/35 mt-2">Square crop, resized to 256px and saved with your profile.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/50 mb-1.5">Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1.5">Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={inputClass} placeholder="Tell the crew about your build…" />
        </div>
        {error && <p className="text-negative text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save profile"}
        </button>
      </form>

      <div className="card space-y-4">
        <h3 className="font-semibold">Preferences</h3>
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1.5">Units</label>
          <div className="flex gap-2">
            {(["kmh", "mph"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnits(u)}
                className={`px-5 py-2 rounded-xl font-medium text-sm border transition-colors ${
                  units === u
                    ? "bg-ink-3 text-white border-white/20"
                    : "bg-ink-1 text-white/50 border-hairline hover:bg-white/[0.05]"
                }`}
              >
                {u === "kmh" ? "km/h · km" : "mph · mi"}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/50 mt-2">Applied across your Analytics charts and summaries.</p>
        </div>
      </div>
    </div>
  )
}
