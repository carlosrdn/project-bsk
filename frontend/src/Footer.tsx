const copy = {
  pt: {
    purpose: 'Este site destina-se apenas a fins informativos e de entretenimento.',
    heading: 'Aviso',
    affiliation: 'O Project BSK não é afiliado, endossado, autorizado nem patrocinado pela National Basketball Association (NBA) ou por qualquer uma de suas equipes.',
    ownership: 'Os nomes, logotipos e marcas das equipes pertencem aos seus respectivos titulares.'
  },
  en: {
    purpose: 'This site is for informational and entertainment purposes only.',
    heading: 'Disclaimer',
    affiliation: 'Project BSK is not affiliated with, endorsed by, authorized by, or sponsored by the National Basketball Association (NBA) or any of its teams.',
    ownership: 'All team names, logos, and brands are the property of their respective owners.'
  },
  es: {
    purpose: 'Este sitio tiene fines exclusivamente informativos y de entretenimiento.',
    heading: 'Aviso',
    affiliation: 'Project BSK no está afiliado a la National Basketball Association (NBA) ni a ninguno de sus equipos, ni cuenta con su respaldo, autorización o patrocinio.',
    ownership: 'Los nombres, logotipos y marcas de los equipos son propiedad de sus respectivos titulares.'
  }
}

type Language = keyof typeof copy

export function footerLanguage(preferences: readonly string[]): Language {
  for (const preference of preferences) {
    const language = preference.toLowerCase().split('-')[0]
    if (language === 'pt' || language === 'en' || language === 'es') return language
  }
  return 'en'
}

export default function Footer() {
  const language = footerLanguage([...navigator.languages, navigator.language])
  const { purpose, heading, affiliation, ownership } = copy[language]
  return <footer className="site-footer" lang={language}>
    <span className="site-footer-brand">© Project BSK</span>
    <p>{purpose}</p>
    <p><strong>{heading}:</strong> {affiliation} {ownership}</p>
  </footer>
}
