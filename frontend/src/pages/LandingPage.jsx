/**
 * Landing Page for Draftly
 * Based on the original draftly.site design
 */

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';

const i18n = {
  en: {
    heroLabel: 'AI-Powered Architectural CAD',
    heroTitleMain: 'Describe it.',
    heroTitleAccent: 'Draft it.',
    heroSubtitle: 'Type your building in plain language. Draftly generates precise 2D architectural floor plans and gives you full CAD editing and DXF export in seconds.',
    getEarlyAccess: 'Get early access',
    joinWaitlist: 'Join the waitlist',
    noSpam: 'No spam. We will notify you when Draftly launches.',
    genTime: 'Generation time',
    exportFormat: 'Export format',
    roomTypes: 'Room types',
    buildingTypes: 'Building types',
    sectionDemo: '/ 01 - Demo',
    sectionFeatures: '/ 02 - Features',
    sectionHow: '/ 03 - How it works',
    features: [
      { title: 'Text to floor plan', desc: 'Describe your building in plain language. AI extracts rooms, areas and adjacency automatically.' },
      { title: 'Constraint-based layout', desc: 'Smart room placement engine respects adjacency rules, zoning logic, and minimum dimensions.' },
      { title: 'Full CAD toolkit', desc: 'Edit generated plans with lines, arcs, text, dimensions, layers and undo/redo in browser.' },
      { title: 'DXF export', desc: 'Export industry-standard DXF files compatible with AutoCAD and professional CAD workflows.' },
      { title: 'Furniture & symbols', desc: 'Beds, sofas, kitchen appliances and sanitary fixtures are placed by room type automatically.' },
      { title: 'Any building type', desc: 'Apartments, houses, offices, commercial spaces and more with adaptive layout logic.' },
    ],
    steps: [
      { title: 'Describe your building', desc: 'Type what you need: rooms, areas, floors and style. Be as specific or as broad as you want.' },
      { title: 'AI parses the layout', desc: 'The model creates a room graph with constraints and adjacency, then solves the plan structure.' },
      { title: 'Plan appears on canvas', desc: 'Walls, doors, windows, labels and dimensions are generated as editable CAD elements.' },
      { title: 'Refine and export', desc: 'Adjust details in the editor and export a clean DXF file for production workflows.' },
    ],
    ctaTitleMain: 'Design faster.',
    ctaTitleAccent: 'Think clearer.',
    ctaSubtitle: 'Join the waitlist and be first to experience AI architectural drafting when we launch.',
    footerCopy: '2026 - All rights reserved',
    emailPlaceholder: 'your@email.com',
    invalidEmail: 'Please enter a valid email address.',
    serverError: 'Could not submit. Please try again in a moment.',
    successSent: 'Success. Check your inbox to verify your email.',
    successResent: 'Verification email resent. Please check your inbox.',
    alreadyVerified: 'This email is already verified. We will notify you on launch.',
    sending: 'Sending...',
    ticker: ['Residential', 'Commercial Offices', 'DXF Export', 'AI-Generated Layouts', 'Layer Management', 'CAD Editing Tools', 'Dimensions & Annotations', 'Multi-Floor Plans'],
    modalTitle: 'Email Confirmed!',
    modalDesc: 'You are officially on the waitlist. We will let you know when we launch.',
    modalBtn: 'Awesome',
    login: 'Log in',
    signup: 'Sign up',
    launchApp: 'Launch App',
  },
  ru: {
    heroLabel: 'Архитектурный CAD с ИИ',
    heroTitleMain: 'Опишите идею.',
    heroTitleAccent: 'Draftly нарисует.',
    heroSubtitle: 'Опишите здание обычным языком. Draftly генерирует точные 2D-планы и дает полный CAD-редактор с экспортом DXF за секунды.',
    getEarlyAccess: 'Получить ранний доступ',
    joinWaitlist: 'Присоединиться к листу',
    noSpam: 'Без спама. Уведомим вас, когда Draftly запустится.',
    genTime: 'Время генерации',
    exportFormat: 'Формат экспорта',
    roomTypes: 'Типы помещений',
    buildingTypes: 'Типы зданий',
    sectionDemo: '/ 01 - Демо',
    sectionFeatures: '/ 02 - Возможности',
    sectionHow: '/ 03 - Как это работает',
    features: [
      { title: 'Текст в план этажа', desc: 'Опишите здание простым языком. ИИ автоматически извлекает комнаты, площади и связи между ними.' },
      { title: 'Планировка с ограничениями', desc: 'Умный движок учитывает соседство помещений, зонирование и минимальные размеры.' },
      { title: 'Полный CAD-инструментарий', desc: 'Редактируйте план: линии, дуги, текст, размеры, слои и undo/redo прямо в браузере.' },
      { title: 'Экспорт в DXF', desc: 'Экспортируйте DXF-файлы, совместимые с AutoCAD и профессиональными CAD-процессами.' },
      { title: 'Мебель и символы', desc: 'Кровати, диваны, кухонная техника и сантехника размещаются автоматически по типу комнаты.' },
      { title: 'Любой тип здания', desc: 'Квартиры, дома, офисы, коммерческие объекты и другие сценарии с адаптивной логикой.' },
    ],
    steps: [
      { title: 'Опишите здание', desc: 'Введите нужные комнаты, площади, этажи и стиль. Можно подробно или в общих чертах.' },
      { title: 'ИИ разбирает структуру', desc: 'Модель создает граф помещений с ограничениями и соседством, затем строит планировку.' },
      { title: 'План появляется на холсте', desc: 'Стены, двери, окна, подписи и размеры формируются как редактируемые CAD-объекты.' },
      { title: 'Уточните и экспортируйте', desc: 'Подправьте детали в редакторе и экспортируйте чистый DXF для рабочих процессов.' },
    ],
    ctaTitleMain: 'Проектируйте быстрее.',
    ctaTitleAccent: 'Думайте яснее.',
    ctaSubtitle: 'Вступайте в лист ожидания и получите доступ к AI-архпроектированию одним из первых.',
    footerCopy: '2026 - Все права защищены',
    emailPlaceholder: 'your@email.com',
    invalidEmail: 'Введите корректный email.',
    serverError: 'Что-то пошло не так, попробуйте снова',
    successSent: 'Готово. Проверьте почту для подтверждения email.',
    successResent: 'Письмо с подтверждением отправлено повторно.',
    alreadyVerified: 'Вы уже в списке!',
    sending: 'Отправка...',
    ticker: ['Жилая архитектура', 'Коммерческие офисы', 'Экспорт DXF', 'Планировки от ИИ', 'Управление слоями', 'CAD-инструменты', 'Размеры и аннотации', 'Многоэтажные планы'],
    modalTitle: 'Почта подтверждена!',
    modalDesc: 'Вы успешно добавлены в список ожидания. Мы свяжемся с вами перед запуском.',
    modalBtn: 'Отлично',
    login: 'Войти',
    signup: 'Регистрация',
    launchApp: 'Открыть приложение',
  }
};

function WaitlistForm({ lang, location, isAuthenticated }) {
  const t = i18n[lang];
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formHidden, setFormHidden] = useState(false);

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    
    if (!isValidEmail(email)) {
      setStatus(t.invalidEmail);
      setStatusType('error');
      return;
    }

    setLoading(true);
    try {
      const result = await api.joinWaitlist(email, location);
      if (result.message === 'sent' || result.message === 'resent') {
        setStatus(t[result.message === 'sent' ? 'successSent' : 'successResent']);
        setStatusType('success');
        setFormHidden(true);
      } else if (result.message === 'already_verified') {
        setStatus(t.alreadyVerified);
        setStatusType('success');
        setFormHidden(true);
      } else {
        setStatus(t.serverError);
        setStatusType('error');
      }
    } catch (err) {
      setStatus(t.serverError);
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <Link to="/app" className="btn-primary px-8 py-4 text-lg">
        {t.launchApp}
      </Link>
    );
  }

  return (
    <div className="lead-capture">
      {!formHidden && (
        <form className="form-wrap" onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            autoComplete="email"
          />
          <button type="submit" disabled={loading}>
            {loading ? t.sending : (location === 'hero' ? t.getEarlyAccess : t.joinWaitlist)}
          </button>
        </form>
      )}
      {location === 'hero' && !formHidden && (
        <p className="form-note">{t.noSpam}</p>
      )}
      {status && (
        <div className={`status-msg ${statusType}`}>{status}</div>
      )}
    </div>
  );
}

export default function LandingPage({ isAuthenticated = false }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');
  const [searchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const t = i18n[lang];

  useEffect(() => {
    const verified = searchParams.get('verified');
    if (verified) {
      setShowModal(true);
      if (verified === 'true') {
        setModalMessage('verified');
      } else if (verified === 'already') {
        setModalMessage('already');
      } else {
        setModalMessage('error');
      }
    }
  }, [searchParams]);

  const toggleLang = () => {
    const newLang = lang === 'en' ? 'ru' : 'en';
    setLang(newLang);
    localStorage.setItem('lang', newLang);
  };

  return (
    <div className="landing-page">
      <div className="orb"></div>
      
      <nav className="landing-nav">
        <div className="logo">
          <span className="logo-dot"></span>
          Draftly
        </div>
        <div className="nav-right">
          {isAuthenticated ? (
            <Link to="/app" className="nav-btn">{t.launchApp}</Link>
          ) : (
            <>
              <Link to="/login" className="nav-link">{t.login}</Link>
              <Link to="/signup" className="nav-btn">{t.signup}</Link>
            </>
          )}
          <button onClick={toggleLang} className="lang-toggle">
            {lang === 'en' ? 'EN / RU' : 'RU / EN'}
          </button>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-label">{t.heroLabel}</div>
          <h1>
            <span>{t.heroTitleMain}</span>{' '}
            <em>{t.heroTitleAccent}</em>
            <span className="cursor"></span>
          </h1>
          <p className="hero-sub">{t.heroSubtitle}</p>
          
          <WaitlistForm lang={lang} location="hero" isAuthenticated={isAuthenticated} />

          <div className="stats">
            <div className="stat-item">
              <div className="stat-num">~5s</div>
              <div className="stat-label">{t.genTime}</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">DXF</div>
              <div className="stat-label">{t.exportFormat}</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">10+</div>
              <div className="stat-label">{t.roomTypes}</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">&infin;</div>
              <div className="stat-label">{t.buildingTypes}</div>
            </div>
          </div>
        </section>

        <div className="ticker-strip">
          <div className="ticker-track">
            {[0, 1].map(i => (
              <div key={i} className="ticker-group">
                {t.ticker.map((item, idx) => (
                  <span key={idx} className="ticker-item">{item}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section className="section">
          <div className="section-label">{t.sectionDemo}</div>
          <div className="video-wrap">
            <video autoPlay muted loop playsInline preload="auto">
              <source src={lang === 'en' ? '/video_en.mp4' : '/video_ru.mp4'} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            <div className="video-placeholder">
              <div>Demo video</div>
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="section-label">{t.sectionFeatures}</div>
          <div className="features-grid">
            {t.features.map((feature, idx) => (
              <article key={idx} className="feature-card">
                <div className="feature-icon">{String(idx + 1).padStart(2, '0')}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-desc">{feature.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="section-label">{t.sectionHow}</div>
          <div className="how-wrap">
            {t.steps.map((step, idx) => (
              <div key={idx} className="step">
                <div className="step-num">{String(idx + 1).padStart(2, '0')}</div>
                <div>
                  <h3 className="step-title">{step.title}</h3>
                  <p className="step-desc">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="cta">
          <h2>
            <span>{t.ctaTitleMain}</span>{' '}
            <em>{t.ctaTitleAccent}</em>
          </h2>
          <p>{t.ctaSubtitle}</p>
          <WaitlistForm lang={lang} location="cta" isAuthenticated={isAuthenticated} />
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-logo">Draftly</div>
        <div className="footer-copy">{t.footerCopy}</div>
      </footer>

      {showModal && (
        <div className="modal-backdrop show" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">&#10003;</div>
            <h3 className="modal-title">{t.modalTitle}</h3>
            <p className="modal-desc">{t.modalDesc}</p>
            <button className="modal-btn" onClick={() => setShowModal(false)}>
              {t.modalBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
