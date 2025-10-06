// RSS Aggregator для NewsHub
// Система агрегации новостей из множественных RSS источников

class RSSAggregator {
    constructor() {
        // Ссылка на VK API
        this.vkApi = null;
        
        this.sources = [
            // Технологические источники (проверенные, прямые RSS)
            { id: 'habr', name: 'Habr', url: 'https://habr.com/ru/rss/hub/programming/', category: 'tech', enabled: true, priority: 1, direct: true },
            { id: 'vc-tech', name: 'VC.ru', url: 'https://vc.ru/rss', category: 'tech', enabled: true, priority: 2, direct: true },
            
            // Международные IT источники (проверенные форматы)
            { id: 'dev-to', name: 'Dev.to', url: 'https://dev.to/feed', category: 'tech', enabled: true, priority: 3 },
            { id: 'github-blog', name: 'GitHub Blog', url: 'https://github.blog/feed/', category: 'tech', enabled: true, priority: 4 },
            
            // Деловые новости (только надежные)
            { id: 'kommersant', name: 'Коммерсантъ', url: 'https://www.kommersant.ru/RSS/news.xml', category: 'business', enabled: true, priority: 5 },
            
            // Общие новости (только работающие)
            { id: 'lenta', name: 'Лента.ру', url: 'https://lenta.ru/rss', category: 'general', enabled: true, priority: 6 },
            { id: 'ria', name: 'РИА Новости', url: 'https://ria.ru/export/rss2/archive/index.xml', category: 'general', enabled: true, priority: 7 },
            
            // Дизайн и UX (международные)
            { id: 'smashing', name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', category: 'design', enabled: true, priority: 8 },
            { id: 'css-tricks', name: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', category: 'design', enabled: true, priority: 9 },
            
            // Дополнительные проверенные источники
            { id: 'freecodecamp', name: 'freeCodeCamp', url: 'https://www.freecodecamp.org/news/rss/', category: 'tech', enabled: true, priority: 10 },
            { id: 'hashnode', name: 'Hashnode', url: 'https://hashnode.com/rss', category: 'tech', enabled: true, priority: 11 },
            
            // Отключенные проблемные источники (для справки)
            { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech', enabled: false },
            { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'tech', enabled: false },
            { id: 'rbc', name: 'РБК', url: 'https://rssexport.rbc.ru/rbcnews/news/20/full.rss', category: 'business', enabled: false },
            { id: 'vedomosti', name: 'Ведомости', url: 'https://www.vedomosti.ru/rss/news', category: 'business', enabled: false },
            { id: 'tass', name: 'ТАСС', url: 'https://tass.ru/rss/v2.xml', category: 'general', enabled: false },
            { id: 'gazeta', name: 'Газета.ру', url: 'https://www.gazeta.ru/export/rss/lenta.xml', category: 'general', enabled: false },
            { id: 'finam', name: 'Финам', url: 'https://www.finam.ru/analysis/conews/rsspoint/', category: 'finance', enabled: false },
            { id: 'investing', name: 'Investing.com', url: 'https://ru.investing.com/rss/news.rss', category: 'finance', enabled: false }
        ];
        
        // Несколько CORS прокси для надежности (из изученных проектов)
        this.corsProxies = [
            'https://api.allorigins.win/get?url=',
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://thingproxy.freeboard.io/fetch/'
        ];
        this.currentProxyIndex = 0;
        
        // Улучшенная система персонализации (из newshub-master-final)
        this.selectedProfessions = [];
        this.relevanceScoring = true;
        
        this.cache = new Map();
        this.cacheTimeout = 15 * 60 * 1000; // 15 минут
        this.articles = [];
        this.isLoading = false;
        this.failedSources = new Set(); // Отслеживаем неработающие источники
        
        this.init();
    }
    
    init() {
        this.loadSavedSources();
    }
    
    // Загрузка сохраненных источников
    loadSavedSources() {
        try {
            const saved = localStorage.getItem('rss_sources');
            if (saved) {
                const savedSources = JSON.parse(saved);
                this.sources = this.sources.map(source => {
                    const savedSource = savedSources.find(s => s.id === source.id);
                    return savedSource ? { ...source, ...savedSource } : source;
                });
            }
        } catch (error) {
            // Ошибка загрузки источников
        }
    }
    
    // Сохранение источников
    saveSources() {
        try {
            localStorage.setItem('rss_sources', JSON.stringify(this.sources));
        } catch (error) {
            // Ошибка сохранения источников
        }
    }
    
    // Получение активных источников
    getActiveSources() {
        return this.sources.filter(source => source.enabled);
    }
    
    // Добавление нового источника
    addSource(sourceData) {
        const newSource = {
            id: Date.now().toString(),
            name: sourceData.name,
            url: sourceData.url,
            category: sourceData.category || 'general',
            enabled: true
        };
        
        this.sources.push(newSource);
        this.saveSources();
        return newSource;
    }
    
    // Удаление источника
    removeSource(sourceId) {
        this.sources = this.sources.filter(s => s.id !== sourceId);
        this.saveSources();
    }
    
    // Переключение состояния источника
    toggleSource(sourceId, enabled) {
        const source = this.sources.find(s => s.id === sourceId);
        if (source) {
            source.enabled = enabled;
            this.saveSources();
        }
    }
    
    // Основной метод агрегации
    async aggregateNews(maxArticles = 50) {
        if (this.isLoading) {
            // Агрегация уже выполняется
            return this.articles;
        }
        
        this.isLoading = true;
        try {
            const activeSources = this.getActiveSources();
            
            const promises = activeSources.map(source => this.fetchFromSource(source));
            const results = await Promise.allSettled(promises);
            
            // Собираем все статьи
            let allArticles = [];
            let successfulSources = 0;
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
                    // Фильтруем fallback статьи
                    const realArticles = result.value.filter(article => !article.isFallback);
                    if (realArticles.length > 0) {
                        allArticles = allArticles.concat(realArticles);
                        successfulSources++;
                    }
                } else {
                    // Ошибка загрузки из источника
                }
            });
            
            // VK посты загружаются отдельно только при выборе типа вакансии
            // Это ускоряет загрузку основных новостей
            
            // Если ни один источник не сработал, возвращаем пустой массив
            if (allArticles.length === 0) {
                console.warn('⚠️ Нет статей из источников');
            }
            
            // Дедупликация и сортировка
            const uniqueArticles = this.deduplicateArticles(allArticles);
            const sortedArticles = this.sortArticles(uniqueArticles);
            
            this.articles = sortedArticles.slice(0, maxArticles);
            
            const statusMessage = successfulSources > 0 
                ? `✅ Загружено ${this.articles.length} статей из ${successfulSources}/${activeSources.length} источников`
                : `📋 Все RSS источники недоступны, показываем демо-контент (${this.articles.length} статей)`;
            
            // Показываем статус загрузки
            
            // Показываем уведомление пользователю
            if (typeof window.showToast === 'function') {
                if (successfulSources === 0) {
                    window.showToast('RSS источники недоступны, показываем демо-контент', 'warning');
                } else if (successfulSources < activeSources.length) {
                    window.showToast(`Загружено из ${successfulSources}/${activeSources.length} источников`, 'info');
                } else {
                    window.showToast(`Загружено ${this.articles.length} новых статей`, 'success');
                }
            }
            
            // Кэшируем результат
            this.cacheArticles();
            
            return this.articles;
            
        } catch (error) {
            // Критическая ошибка агрегации
            
            // В случае критической ошибки возвращаем пустой массив
            this.articles = [];
                
            // Уведомляем пользователя
            if (typeof window.showToast === 'function') {
                window.showToast('Ошибка загрузки новостей', 'error');
            }
            
            return this.articles;
        } finally {
            this.isLoading = false;
        }
    }
    
    // Загрузка из одного источника
    async fetchFromSource(source) {
        try {
            const cacheKey = `rss_${source.id}`;
            const cached = this.cache.get(cacheKey);
            
            // Проверяем кэш
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                // Используем кэш
                return cached.articles;
            }
                        // Загружаем источник
            
            // Проверяем, не в черном списке ли источник
            if (this.failedSources.has(source.id)) {
                // Пропускаем источник (в черном списке)
                return [];
            }
            
            let articles = [];
            let lastError = null;
            
            // Если источник поддерживает прямой доступ, пробуем сначала без прокси
            if (source.direct) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 8000);
                    
                    const response = await fetch(source.url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/xml, text/xml, application/rss+xml',
                        },
                        signal: controller.signal,
                        mode: 'cors'
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.ok) {
                        const xmlText = await response.text();
                        articles = this.parseRSS(xmlText, source);
                        
                        if (articles.length > 0) {
                            console.log(`✅ Прямая загрузка ${source.name}: ${articles.length} статей`);
                            this.cache.set(cacheKey, { articles, timestamp: Date.now() });
                            return articles;
                        }
                    }
                } catch (error) {
                    console.log(`⚠️ Прямая загрузка ${source.name} не удалась, пробуем прокси`);
                }
            }
            
            // Пробуем все доступные прокси
            for (let i = 0; i < this.corsProxies.length; i++) {
                const proxyIndex = (this.currentProxyIndex + i) % this.corsProxies.length;
                const proxy = this.corsProxies[proxyIndex];
                
                try {
                    // Пробуем прокси
                    
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут
                    
                    const response = await fetch(`${proxy}${encodeURIComponent(source.url)}`, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json, text/xml, application/xml, text/plain',
                            'User-Agent': 'NewsHub/1.0'
                        },
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    let xmlText;
                    const contentType = response.headers.get('content-type') || '';
                    
                    if (contentType.includes('application/json')) {
                        const data = await response.json();
                        xmlText = data.contents || data.data || data;
                    } else {
                        xmlText = await response.text();
                    }
                    
                    if (!xmlText) {
                        throw new Error('Пустой ответ от источника');
                    }
                    
                    articles = this.parseRSS(xmlText, source);
                    
                    if (articles.length > 0) {
                        // Успешно загрузили - кэшируем и выходим
                        // Успешно загружены статьи
                        this.cache.set(cacheKey, {
                            articles,
                            timestamp: Date.now()
                        });
                        
                        // Обновляем рабочий прокси
                        this.currentProxyIndex = proxyIndex;
                        return articles;
                    }
                    
                } catch (error) {
                    lastError = error;
                    // Прокси не работает
                    
                    // Если это таймаут, пробуем следующий прокси быстрее
                    if (error.name === 'AbortError') {
                        // Таймаут для источника
                        continue;
                    }
                }
            }
            
            // Если все прокси не сработали, добавляем в черный список на время
            // Источник временно недоступен
            this.failedSources.add(source.id);
            
            // Убираем из черного списка через 15 минут (уменьшили время)
            setTimeout(() => {
                this.failedSources.delete(source.id);
                // Источник снова доступен для проверки
            }, 15 * 60 * 1000);
            
            // Возвращаем fallback данные только для важных источников
            if (source.priority && source.priority <= 5) {
                return this.getFallbackArticles(source);
            }
            
            return [];
            
        } catch (error) {
            // Критическая ошибка при загрузке источника
            return this.getFallbackArticles(source);
        }
    }
    
    // Fallback данные когда RSS не работает
    getFallbackArticles(source) {
        // Используем fallback данные
        
        const fallbackArticles = [
            {
                id: `fallback-${source.id}-1`,
                title: `Новости ${source.name} временно недоступны`,
                description: 'RSS-лента источника временно недоступна. Мы работаем над восстановлением доступа.',
                link: '#',
                publishedAt: new Date().toISOString(),
                source: {
                    name: source.name,
                    category: source.category
                },
                category: source.category,
                readingTime: 1,
                likes: 0,
                isFallback: true
            }
        ];
        
        return fallbackArticles;
    }
    
    
    // Парсинг RSS XML
    parseRSS(xmlText, source) {
        try {
            // Проверяем, что получили валидный XML
            if (!xmlText || typeof xmlText !== 'string') {
                throw new Error('Невалидный XML контент');
            }
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            // Проверяем на ошибки парсинга
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                // Ошибка парсинга XML
                throw new Error('Ошибка парсинга XML');
            }
            
            // Ищем элементы в разных форматах RSS/Atom
            let items = xmlDoc.querySelectorAll('item');
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('entry'); // Atom формат
            }
            
            if (items.length === 0) {
                // Не найдено статей в RSS
                return [];
            }
            
            const articles = [];
            
            items.forEach((item, index) => {
                if (index >= 10) return; // Ограничиваем количество статей с источника
                
                try {
                    const article = this.parseArticle(item, source);
                    if (article) {
                        articles.push(article);
                    }
                } catch (error) {
                    // Ошибка парсинга статьи
                }
            });
            
            // Успешно распарсены статьи
            return articles;
            
        } catch (error) {
            // Ошибка парсинга RSS
            return [];
        }
    }
    
    // Парсинг отдельной статьи
    parseArticle(item, source) {
        const getTextContent = (selector) => {
            const element = item.querySelector(selector);
            return element ? element.textContent.trim() : '';
        };
        
        const title = getTextContent('title');
        const link = getTextContent('link');
        const description = getTextContent('description');
        const pubDate = getTextContent('pubDate');
        const category = getTextContent('category') || source.category;
        
        if (!title || !link) {
            return null;
        }
        
        // Очищаем описание от HTML тегов
        const cleanDescription = description.replace(/<[^>]*>/g, '').trim();
        
        // Парсим дату
        let publishedAt = new Date();
        if (pubDate) {
            const parsedDate = new Date(pubDate);
            if (!isNaN(parsedDate.getTime())) {
                publishedAt = parsedDate;
            }
        }
        
        return {
            id: this.generateArticleId(link),
            title: this.cleanText(title),
            description: this.cleanText(cleanDescription),
            link,
            source: {
                id: source.id,
                name: source.name,
                category: source.category
            },
            category,
            publishedAt,
            timestamp: Date.now(),
            readingTime: this.estimateReadingTime(cleanDescription),
            isRead: false,
            isSaved: false
        };
    }
    
    // Генерация ID статьи
    generateArticleId(link) {
        return btoa(link).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    }
    
    // Очистка текста
    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
    }
    
    // Оценка времени чтения
    estimateReadingTime(text) {
        const wordsPerMinute = 200;
        const words = text.split(/\s+/).length;
        const minutes = Math.ceil(words / wordsPerMinute);
        return Math.max(1, minutes);
    }
    
    // Дедупликация статей
    deduplicateArticles(articles) {
        const seen = new Set();
        const unique = [];
        
        articles.forEach(article => {
            // Создаем ключ для дедупликации на основе заголовка
            const key = article.title.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(article);
            }
        });
        
        // Дедупликация статей
        return unique;
    }
    
    // Улучшенная сортировка статей с оценкой релевантности
    sortArticles(articles) {
        return articles.sort((a, b) => {
            // Если включена система релевантности, сортируем по релевантности
            if (this.relevanceScoring && this.selectedProfessions.length > 0) {
                const scoreA = this.calculateRelevanceScore(a);
                const scoreB = this.calculateRelevanceScore(b);
                if (scoreB !== scoreA) return scoreB - scoreA;
            }
            
            // Затем по дате (новые первыми)
            const dateCompare = new Date(b.publishedAt) - new Date(a.publishedAt);
            if (dateCompare !== 0) return dateCompare;
            
            // Затем по приоритету источника
            const aPriority = a.source.priority || 999;
            const bPriority = b.source.priority || 999;
            if (aPriority !== bPriority) return aPriority - bPriority;
            
            return 0;
        });
    }
    
    // Система оценки релевантности (из newshub-master-final)
    calculateRelevanceScore(article) {
        if (!this.selectedProfessions.length) return 0;
        
        let score = 0;
        const contentText = `${article.title} ${article.description}`.toLowerCase();
        
        // Проверяем соответствие выбранным профессиям
        this.selectedProfessions.forEach(professionId => {
            const profession = this.getProfessionById(professionId);
            if (!profession) return;
            
            // Прямое соответствие профессии
            if (article.relevantProfessions?.includes(professionId)) {
                score += 50;
            }
            
            // Соответствие ключевым словам
            if (profession.keywords) {
                profession.keywords.forEach(keyword => {
                    if (contentText.includes(keyword.toLowerCase())) {
                        score += 10;
                    }
                });
            }
        });
        
        // Бонус за свежесть
        const hoursAgo = (Date.now() - new Date(article.publishedAt)) / (1000 * 60 * 60);
        if (hoursAgo < 24) score += 5;
        if (hoursAgo < 6) score += 3;
        
        return score;
    }
    
    // Получение профессии по ID (заглушка, нужно будет интегрировать с системой профессий)
    getProfessionById(id) {
        // Базовые профессии для демонстрации
        const professions = {
            1: { name: "Frontend Developer", keywords: ["react", "vue", "angular", "javascript", "typescript", "css", "html"] },
            2: { name: "Backend Developer", keywords: ["python", "java", "nodejs", "php", "golang", "api"] },
            3: { name: "Fullstack Developer", keywords: ["fullstack", "javascript", "python", "react", "nodejs"] }
        };
        return professions[id];
    }
    
    // Кэширование статей
    cacheArticles() {
        try {
            const cacheData = {
                articles: this.articles,
                timestamp: Date.now()
            };
            localStorage.setItem('cached_articles', JSON.stringify(cacheData));
        } catch (error) {
            // Ошибка кэширования статей
        }
    }
    
    // Получение кэшированных статей
    getCachedArticles() {
        try {
            const cached = localStorage.getItem('cached_articles');
            if (cached) {
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp < this.cacheTimeout * 2) {
                    // Используем кэшированные статьи
                    return data.articles || [];
                }
            }
        } catch (error) {
            // Ошибка загрузки кэшированных статей
        }
        return [];
    }
    
    // Фильтрация статей
    filterArticles(filters = {}) {
        let filtered = [...this.articles];
        
        // Фильтр по категории
        if (filters.category && filters.category !== 'all') {
            filtered = filtered.filter(article => article.category === filters.category);
        }
        
        // Фильтр по источнику
        if (filters.sources && filters.sources.length > 0) {
            filtered = filtered.filter(article => filters.sources.includes(article.source.id));
        }
        
        // Фильтр по ключевым словам
        if (filters.keywords && filters.keywords.length > 0) {
            filtered = filtered.filter(article => {
                const text = `${article.title} ${article.description}`.toLowerCase();
                return filters.keywords.some(keyword => 
                    text.includes(keyword.toLowerCase())
                );
            });
        }
        
        // Фильтр по дате
        if (filters.dateRange) {
            const now = new Date();
            let cutoffDate;
            
            switch (filters.dateRange) {
                case 'today':
                    cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
            }
            
            if (cutoffDate) {
                filtered = filtered.filter(article => article.publishedAt >= cutoffDate);
            }
        }
        
        return filtered;
    }
    
    // Поиск по статьям
    searchArticles(query) {
        if (!query || query.trim().length < 2) {
            return this.articles;
        }
        
        const searchTerms = query.toLowerCase().trim().split(/\s+/);
        
        return this.articles.filter(article => {
            const searchText = `${article.title} ${article.description}`.toLowerCase();
            return searchTerms.every(term => searchText.includes(term));
        });
    }
    
    // Методы управления профессиями (из newshub-master-final)
    setSelectedProfessions(professionIds) {
        this.selectedProfessions = professionIds;
        // Обновление выбранных профессий
    }
    
    addProfession(professionId) {
        if (!this.selectedProfessions.includes(professionId)) {
            this.selectedProfessions.push(professionId);
        }
    }
    
    removeProfession(professionId) {
        this.selectedProfessions = this.selectedProfessions.filter(id => id !== professionId);
    }
    
    
    // Проверка доступности источников
    async checkSourcesHealth() {
        // Проверка доступности RSS источников
        
        const activeSources = this.getActiveSources();
        const healthCheck = {
            total: activeSources.length,
            available: 0,
            unavailable: 0,
            sources: {}
        };
        
        for (const source of activeSources) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(`${this.corsProxies[0]}${encodeURIComponent(source.url)}`, {
                    method: 'HEAD',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    healthCheck.available++;
                    healthCheck.sources[source.id] = 'available';
                    // Источник доступен
                } else {
                    healthCheck.unavailable++;
                    healthCheck.sources[source.id] = 'unavailable';
                    // Источник недоступен
                }
            } catch (error) {
                healthCheck.unavailable++;
                healthCheck.sources[source.id] = 'error';
                // Ошибка при проверке источника
            }
        }
        
        // Завершение проверки доступности
        return healthCheck;
    }

    // Очистка кэша и сброс ошибок
    clearCache() {
        this.cache.clear();
        this.failedSources.clear();
        console.log('🗑️ Кэш очищен, источники сброшены');
    }

    // Функция для загрузки VK постов при выборе типа вакансии
    async loadVKPostsForJobType(jobType) {
        if (!this.vkApi || !jobType) return [];
        
        console.log('📱 Загружаем VK посты для типа вакансии:', jobType);
        try {
            const vkArticles = await this.fetchFromVK(jobType);
            if (vkArticles && vkArticles.length > 0) {
                console.log(`✅ Загружено ${vkArticles.length} VK постов для ${jobType}`);
                return vkArticles;
            }
        } catch (error) {
            console.warn('⚠️ Ошибка загрузки VK постов:', error);
        }
        return [];
    }

    // Функция для загрузки VK постов с фильтрацией по типу вакансии
    async fetchFromVK(jobType = null) {
        if (!this.vkApi) {
            console.warn('VK API не инициализирован');
            return [];
        }
        try {
            console.log('📱 Загружаем посты из VK групп...');
            
            // Получаем группы с учетом фильтра по типу вакансии
            let vkGroups = this.vkApi.groups;
            
            // Добавляем пользовательские VK группы
            const customVkGroups = JSON.parse(localStorage.getItem('custom_vk_groups') || '[]');
            const enabledCustomGroups = customVkGroups.filter(group => group.enabled);
            
            if (enabledCustomGroups.length > 0) {
                vkGroups = [...vkGroups, ...enabledCustomGroups];
                console.log(`📱 Добавлено ${enabledCustomGroups.length} пользовательских VK групп`);
            }
            
            if (jobType && window.CONFIG?.vkGroups) {
                console.log(`🔍 Исходное количество VK групп: ${vkGroups.length}`);
                console.log(`🔍 Ищем группы для типа вакансии: "${jobType}"`);
                console.log(`🔍 Доступно групп в CONFIG: ${window.CONFIG.vkGroups.length}`);
                
                // Фильтруем и приоритизируем группы по связанным вакансиям
                const relevantGroups = vkGroups.filter(group => {
                    const hasRelatedJobs = group.relatedJobs && group.relatedJobs.includes(jobType);
                    if (hasRelatedJobs) {
                        console.log(`✅ Группа "${group.name}" подходит для "${jobType}"`);
                    }
                    return hasRelatedJobs;
                });
                
                if (relevantGroups.length > 0) {
                    // Сортируем группы по приоритету для данного типа вакансии
                    const prioritizedGroups = this.prioritizeGroupsForJobType(relevantGroups, jobType);
                    vkGroups = prioritizedGroups;
                    
                    console.log(`🎯 Найдено релевантных групп для "${jobType}": ${relevantGroups.length}`);
                    console.log(`📋 Приоритизированные группы:`, vkGroups.map(g => `${g.name} (${g.id}) - приоритет: ${g.priority || 'обычный'}`));
                    console.log(`✅ Используем ${vkGroups.length} отфильтрованных групп`);
                } else {
                    // Если нет точных совпадений, ищем по категориям
                    const categoryGroups = this.getGroupsByJobCategory(vkGroups, jobType);
                    if (categoryGroups.length > 0) {
                        vkGroups = categoryGroups;
                        console.log(`🔄 Не найдено прямых совпадений, используем ${categoryGroups.length} групп по категории`);
                    } else {
                        console.warn(`⚠️ Не найдено релевантных групп для типа "${jobType}", используем универсальные IT группы`);
                        vkGroups = this.getUniversalTechGroups(vkGroups);
                    }
                }
            } else {
                console.log(`📱 Загружаем из всех ${vkGroups.length} VK групп (без фильтрации по типу вакансии)`);
            }
            
            const allPosts = [];
            
            // Загружаем посты с адаптивным количеством в зависимости от приоритета
            const totalPostsTarget = 20; // Целевое количество постов
            const postsPerGroup = Math.max(2, Math.floor(totalPostsTarget / Math.min(vkGroups.length, 8)));
            
            console.log(`📱 Начинаем загрузку из ${vkGroups.length} VK групп с контролем частоты запросов`);
            
            for (let i = 0; i < vkGroups.length; i++) {
                const group = vkGroups[i];
                const groupId = group.id || group;
                
                // Приоритетные группы (первые 3) получают больше постов
                const postCount = i < 3 ? Math.min(postsPerGroup + 2, 8) : postsPerGroup;
                
                console.log(`📱 Загружаем группу ${i + 1}/${vkGroups.length}: ${groupId} (${postCount} постов)`);
                
                try {
                    const posts = await this.vkApi.getGroupPosts(groupId, postCount);
                    if (posts && posts.length > 0) {
                        // Добавляем метаданные о приоритете группы
                        const enrichedPosts = posts.map(post => ({
                            ...post,
                            groupPriority: i + 1,
                            isHighPriority: i < 3,
                            groupCategory: group.category
                        }));
                        
                        allPosts.push(...enrichedPosts);
                        console.log(`✅ VK ${groupId}: ${posts.length} постов (приоритет: ${i + 1})`);
                    } else {
                        console.log(`ℹ️ VK ${groupId}: нет постов`);
                    }
                } catch (error) {
                    console.warn(`⚠️ Ошибка загрузки VK группы ${groupId}:`, error);
                }
                
                // Ограничиваем общее количество постов
                if (allPosts.length >= totalPostsTarget) {
                    console.log(`📊 Достигнуто целевое количество постов: ${allPosts.length}`);
                    break;
                }
            }
            
            // Сортируем посты по релевантности и приоритету
            const sortedPosts = this.sortPostsByRelevance(allPosts, jobType);
            
            console.log(`📱 Всего загружено ${allPosts.length} постов из VK`);
            console.log(`🎯 Посты отсортированы по релевантности для "${jobType}"`);
            
            return sortedPosts;
        } catch (error) {
            console.error('❌ Ошибка загрузки из VK:', error);
            return [];
        }
    }
    
    // Приоритизация групп для конкретного типа вакансии
    prioritizeGroupsForJobType(groups, jobType) {
        // Определяем приоритеты групп для разных типов вакансий
        const jobTypePriorities = {
            'frontend_developer': ['habr', 'tproger', 'webstandards_ru', 'css_live', 'loftblog'],
            'backend_developer': ['habr', 'tproger', 'devnull', 'coders_stuff', 'devcolibri'],
            'full_stack_developer': ['habr', 'tproger', 'proglib', 'frontend_and_backend'],
            'devops_engineer': ['devnull', 'devops', 'habr', 'tproger'],
            'data_scientist': ['data_science', 'ml_ai_bigdata', 'physics_math', 'habr'],
            'machine_learning_engineer': ['ml_ai_bigdata', 'data_science', 'habr', 'yandex'],
            'ux_ui_designer': ['designpub', 'web_design_club', 'habr'],
            'web_designer': ['web_design_club', 'webstandards_ru', 'css_live', 'designpub'],
            'graphic_designer': ['designpub', 'artists_ru', 'web_design_club'],
            'photographer': ['photographers_ru', 'phototech', 'artists_ru'],
            'game_developer': ['gamedev_ru', 'game_dev_memes', 'habr', 'tproger'],
            'product_manager': ['vc_ru', 'startup_vc', 'startup_club'],
            'project_manager': ['vc_ru', 'startup_vc'],
            'doctor': ['medical_jobs', 'doctors_ru', 'medical_community', 'medicine_news'],
            'nurse': ['medical_jobs', 'medical_community', 'medicine_news'],
            'pharmacist': ['pharmacy_ru', 'medical_jobs'],
            'lawyer': ['legal_jobs', 'law_community']
        };
        
        const priorities = jobTypePriorities[jobType] || [];
        
        // Сортируем группы по приоритету
        return groups.sort((a, b) => {
            const aPriority = priorities.indexOf(a.id);
            const bPriority = priorities.indexOf(b.id);
            
            // Если группа есть в приоритетах, она идет первой
            if (aPriority !== -1 && bPriority !== -1) {
                return aPriority - bPriority;
            } else if (aPriority !== -1) {
                return -1;
            } else if (bPriority !== -1) {
                return 1;
            }
            
            // Если обе группы не в приоритетах, сортируем по алфавиту
            return a.name.localeCompare(b.name);
        });
    }
    
    // Получение групп по категории профессии
    getGroupsByJobCategory(groups, jobType) {
        // Определяем категории для типов вакансий
        const jobCategories = {
            'frontend_developer': ['tech'],
            'backend_developer': ['tech'],
            'full_stack_developer': ['tech'],
            'devops_engineer': ['tech'],
            'data_scientist': ['tech', 'education'],
            'machine_learning_engineer': ['tech'],
            'ux_ui_designer': ['design'],
            'web_designer': ['design'],
            'graphic_designer': ['design', 'creative'],
            'photographer': ['creative'],
            'game_developer': ['tech'],
            'product_manager': ['business'],
            'project_manager': ['business', 'management'],
            'doctor': ['healthcare'],
            'nurse': ['healthcare'],
            'pharmacist': ['healthcare'],
            'lawyer': ['professional'],
            'teacher': ['education'],
            'journalist': ['media'],
            'chef': ['service'],
            'accountant': ['finance']
        };
        
        const categories = jobCategories[jobType] || ['tech'];
        
        return groups.filter(group => 
            categories.includes(group.category)
        );
    }
    
    // Получение универсальных IT групп как fallback
    getUniversalTechGroups(groups) {
        const universalGroups = ['habr', 'tproger', 'proglib', 'yandex', 'netology'];
        
        return groups.filter(group => 
            universalGroups.includes(group.id) || 
            group.category === 'tech'
        ).slice(0, 5); // Ограничиваем до 5 групп
    }
    
    // Сортировка постов по релевантности для типа вакансии
    sortPostsByRelevance(posts, jobType) {
        if (!jobType || !posts.length) return posts;
        
        // Ключевые слова для разных типов вакансий
        const jobKeywords = {
            'frontend_developer': ['react', 'vue', 'angular', 'javascript', 'css', 'html', 'frontend', 'фронтенд'],
            'backend_developer': ['node.js', 'python', 'java', 'php', 'backend', 'бэкенд', 'api', 'сервер'],
            'full_stack_developer': ['fullstack', 'full-stack', 'фулстек', 'javascript', 'react', 'node'],
            'devops_engineer': ['docker', 'kubernetes', 'aws', 'devops', 'деплой', 'ci/cd', 'jenkins'],
            'data_scientist': ['python', 'machine learning', 'data science', 'pandas', 'numpy', 'анализ данных'],
            'machine_learning_engineer': ['ml', 'ai', 'tensorflow', 'pytorch', 'машинное обучение'],
            'ux_ui_designer': ['ux', 'ui', 'figma', 'sketch', 'дизайн', 'интерфейс'],
            'web_designer': ['веб-дизайн', 'photoshop', 'illustrator', 'дизайн сайтов'],
            'graphic_designer': ['графический дизайн', 'иллюстрация', 'брендинг', 'логотип'],
            'photographer': ['фотография', 'фотосъемка', 'камера', 'объектив', 'lightroom'],
            'game_developer': ['unity', 'unreal', 'gamedev', 'разработка игр', 'геймдев'],
            'product_manager': ['product management', 'продуктовый менеджер', 'roadmap', 'agile'],
            'project_manager': ['project management', 'проектный менеджер', 'scrum', 'kanban'],
            'doctor': ['медицина', 'лечение', 'диагностика', 'пациент', 'здоровье'],
            'nurse': ['медсестра', 'уход', 'пациент', 'медицина'],
            'pharmacist': ['фармация', 'лекарства', 'аптека', 'препараты'],
            'lawyer': ['право', 'юриспруденция', 'закон', 'суд', 'адвокат']
        };
        
        const keywords = jobKeywords[jobType] || [];
        
        return posts.sort((a, b) => {
            // Вычисляем релевантность поста
            const aRelevance = this.calculatePostRelevance(a, keywords);
            const bRelevance = this.calculatePostRelevance(b, keywords);
            
            // Сначала сортируем по релевантности
            if (aRelevance !== bRelevance) {
                return bRelevance - aRelevance;
            }
            
            // Затем по приоритету группы
            if (a.groupPriority !== b.groupPriority) {
                return a.groupPriority - b.groupPriority;
            }
            
            // Затем по дате (новые сначала)
            return new Date(b.date) - new Date(a.date);
        });
    }
    
    // Вычисление релевантности поста
    calculatePostRelevance(post, keywords) {
        let relevance = 0;
        const text = (post.title + ' ' + post.description + ' ' + post.text).toLowerCase();
        
        // Проверяем наличие ключевых слов
        keywords.forEach(keyword => {
            const keywordLower = keyword.toLowerCase();
            if (text.includes(keywordLower)) {
                relevance += 2; // Базовые очки за ключевое слово
                
                // Дополнительные очки если ключевое слово в заголовке
                if (post.title.toLowerCase().includes(keywordLower)) {
                    relevance += 3;
                }
            }
        });
        
        // Бонус за приоритетную группу
        if (post.isHighPriority) {
            relevance += 1;
        }
        
        // Бонус за активность (лайки, просмотры)
        if (post.likes > 50) relevance += 1;
        if (post.views > 1000) relevance += 1;
        
        return relevance;
    }
    
    // Определение типа вакансии из поискового запроса
    detectJobTypeFromQuery(searchText) {
        if (!searchText || !window.CONFIG?.jobTypes) return null;
        
        const query = searchText.toLowerCase();
        
        // Ищем совпадения с ключевыми словами типов вакансий
        for (const jobType of window.CONFIG.jobTypes) {
            // Проверяем название типа
            if (query.includes(jobType.name.toLowerCase())) {
                return jobType.id;
            }
            
            // Проверяем ключевые слова
            for (const keyword of jobType.keywords) {
                if (query.includes(keyword.toLowerCase())) {
                    return jobType.id;
                }
            }
        }
        
        return null;
    }

    // Получение статистики
    getStats() {
        const stats = {
            totalArticles: this.articles.length,
            sources: this.getActiveSources().length,
            categories: {},
            selectedProfessions: this.selectedProfessions.length,
            failedSources: this.failedSources.size,
            lastUpdate: new Date()
        };
        
        this.articles.forEach(article => {
            const category = article.category || 'general';
            stats.categories[category] = (stats.categories[category] || 0) + 1;
        });
        
        return stats;
    }
}

// Инициализация при загрузке
if (typeof window !== 'undefined') {
    window.RSSAggregator = RSSAggregator;
}
