import { Input, Label } from "@/components/ui/Input";

const countryCodes = [
  ["IN", "+91", "India"], ["US", "+1", "United States / Canada"], ["GB", "+44", "United Kingdom"],
  ["AU", "+61", "Australia"], ["SG", "+65", "Singapore"], ["AE", "+971", "United Arab Emirates"],
];

export function PhoneNumberField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const matched = countryCodes.find(([, dial]) => value.startsWith(dial as string));
  const dial = matched?.[1] as string || "+91";
  const national = value.startsWith(dial) ? value.slice(dial.length) : value.replace(/^\+/, "");
  return <div>
    <Label htmlFor="teacher-phone">Phone number</Label>
    <div className="mt-1 flex gap-2">
      <select aria-label="Country calling code" className="h-10 w-28 rounded-md border border-[#D9DADD] bg-white px-2 text-sm text-[#303238] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]" value={dial} onChange={(event) => onChange(event.target.value + national)}>
        {countryCodes.map(([country, code]) => <option key={country} value={code}>{country} {code}</option>)}
      </select>
      <Input id="teacher-phone" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="98765 43210" value={national} onChange={(event) => onChange(dial + event.target.value.replace(/[^\d]/g, ""))} />
    </div>
    <p className="mt-1 text-xs text-[#747780]">Used for your teacher profile; no SMS verification is sent.</p>
  </div>;
}
