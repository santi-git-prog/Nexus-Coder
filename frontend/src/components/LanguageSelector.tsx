
type Language = {
  value: string;
  label: string;
};

const ALL_LANGUAGES: Language[] = [
  { value: "c", label: "C (GCC 6.3.0)" },
  { value: "python", label: "Python 3" },
];

type LanguageSelectorProps = {
  selectedLanguage: string;
  onChange: (value: string) => void;
  availableLanguages?: string[];
};

export default function LanguageSelector({
  selectedLanguage,
  onChange,
  availableLanguages = ["c", "python"],
}: LanguageSelectorProps) {
  
  const options = ALL_LANGUAGES.filter(
    (lang) => availableLanguages.includes(lang.value)
  );
  
  return (
    <div className="language-selector-wrapper">
      <label htmlFor="language-select" className="panel-label">Language</label>
      <select
        id="language-select"
        value={selectedLanguage}
        onChange={(e) => onChange(e.target.value)}
        className="language-dropdown"
      >
        {options.map((lang) => (
          <option key={lang.value} value={lang.value}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
