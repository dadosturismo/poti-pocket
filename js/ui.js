import { barChart, donutChart, lineChart } from './charts.js';
import { changeBadge, escapeHtml, formatPeriod, formatValue, monthShort, relativeChange } from './format.js';

function valid(value) { return typeof value === 'number' && Number.isFinite(value); }
function sortedPoints(points) { return [...points].filter(point => valid(point.value)).sort((a, b) => String(a.period).localeCompare(String(b.period))); }
function pointAt(points, year, month) { return points.find(point => point.year === year && point.month === month && valid(point.value)) || null; }
function referencePeriod(value) {
  if (/^\d{4}-\d{2}$/.test(value || '')) return value;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function monthlyFilter(points, filter = {}, maximumPeriod = null) {
  const periods = [...new Set(sortedPoints(points)
    .map(point => point.period)
    .filter(period => /^\d{4}-\d{2}$/.test(period) && (!maximumPeriod || period < maximumPeriod)))].sort();
  const years = [...new Set(periods.map(period => Number(period.slice(0, 4))))].sort((a, b) => b - a);
  const requestedYear = Number(filter.year);
  const year = years.includes(requestedYear) ? requestedYear : years[0] || null;
  const months = periods.filter(period => Number(period.slice(0, 4)) === year).map(period => Number(period.slice(5))).sort((a, b) => b - a);
  const requestedMonth = Number(filter.month);
  const month = months.includes(requestedMonth) ? requestedMonth : months[0] || null;
  return { years, months, year, month, period: year && month ? `${year}-${String(month).padStart(2, '0')}` : null };
}

function annualFilter(years, filter = {}) {
  const options = [...new Set(years.filter(Number.isFinite))].sort((a, b) => b - a);
  const requested = Number(filter.year);
  return { years: options, year: options.includes(requested) ? requested : options[0] || null };
}

function periodFilters({ years = [], months = [], year = null, month = null, monthLabel = 'Não se aplica' }) {
  const yearOptions = years.length
    ? years.map(value => `<option value="${value}" ${value === year ? 'selected' : ''}>${value}</option>`).join('')
    : '<option value="">Não se aplica</option>';
  const monthOptions = months.length
    ? months.map(value => `<option value="${value}" ${value === month ? 'selected' : ''}>${MONTH_NAMES[value - 1]}</option>`).join('')
    : `<option value="">${escapeHtml(monthLabel)}</option>`;
  return `<div class="period-filters" aria-label="Filtros de período"><label for="filter-year"><span>Anos</span><select id="filter-year" data-period-filter="year" ${years.length ? '' : 'disabled'}>${yearOptions}</select></label><label for="filter-month"><span>Meses</span><select id="filter-month" data-period-filter="month" ${months.length ? '' : 'disabled'}>${monthOptions}</select></label></div>`;
}

function aggregate(values, method) {
  const usable = values.filter(valid);
  if (!usable.length) return null;
  if (method === 'average') return usable.reduce((sum, value) => sum + value, 0) / usable.length;
  return usable.reduce((sum, value) => sum + value, 0);
}

function comparableAggregate(dataset, latest, method) {
  if (!latest) return null;
  const months = dataset.points.filter(point => point.year === latest.year && point.month <= latest.month && valid(point.value))
    .map(point => point.month)
    .filter(month => pointAt(dataset.points, latest.year - 1, month));
  if (!months.length) return null;
  const current = aggregate(months.map(month => pointAt(dataset.points, latest.year, month)?.value), method);
  const previous = aggregate(months.map(month => pointAt(dataset.points, latest.year - 1, month)?.value), method);
  return { current, previous, months: months.length };
}

function card(label, value, unit, period, comparison = '') {
  return `<article class="kpi-card"><p class="kpi-card__label">${escapeHtml(label)}</p><p class="kpi-card__value">${escapeHtml(formatValue(value, unit, true))}</p>${period ? `<p class="kpi-card__period">${escapeHtml(period)}</p>` : ''}${comparison}</article>`;
}

function metadata(indicator) {
  if (!indicator.notes?.length && !indicator.availableSheets?.length) return '';
  const notes = indicator.notes?.map(note => `<p>${escapeHtml(note)}</p>`).join('') || '<p>Nenhuma nota metodológica foi localizada na aba.</p>';
  const sheets = indicator.availableSheets?.map(escapeHtml).join(', ') || '';
  return `<div class="metadata"><details><summary>Fonte, metodologia e observações</summary><div class="metadata__body">${notes}${sheets ? `<p class="source-sheet">Abas de origem: ${sheets}</p>` : ''}</div></details></div>`;
}

function pageHeader(indicator, subtitle) {
  return `<header class="page-header"><div class="page-header__top"><h1>${escapeHtml(indicator.title)}</h1>${indicator.priority ? `<span class="pill">Prioritário ${indicator.priority}</span>` : ''}</div>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</header>`;
}

export function renderNavigation(indicators, activeId) {
  const priorities = indicators.filter(item => item.priority).sort((a, b) => a.priority - b.priority);
  const others = indicators.filter(item => !item.priority);
  const link = (item, index) => `<a class="nav-link" href="#${encodeURIComponent(item.id)}" ${activeId === item.id ? 'aria-current="page"' : ''}><span class="nav-link__index">${String(index).padStart(2, '0')}</span><span>${escapeHtml(item.shortTitle || item.title)}</span></a>`;
  return `<a class="nav-link" href="#visao-geral" ${activeId === 'visao-geral' ? 'aria-current="page"' : ''}><span class="nav-link__index">00</span><span>Visão geral</span></a><p class="nav-heading">Prioritários</p>${priorities.map((item, index) => link(item, index + 1)).join('')}<p class="nav-heading">Demais indicadores</p>${others.map((item, index) => link(item, index + priorities.length + 1)).join('')}`;
}

export function renderOverview(payload, filter = {}) {
  const currentPeriod = referencePeriod(payload.currentPeriod);
  const priorities = payload.indicators.filter(item => item.priority).sort((a, b) => a.priority - b.priority);
  const primaryPoints = priorities.flatMap(indicator => indicator.datasets?.[0]?.points || []);
  const selected = monthlyFilter(primaryPoints, filter, currentPeriod);
  const cards = priorities.map(indicator => {
    const datasets = indicator.datasets || [];
    const primary = pointAt(datasets[0]?.points || [], selected.year, selected.month);
    const previous = primary ? pointAt(datasets[0].points, primary.year - 1, primary.month) : null;
    const secondary = pointAt(datasets[1]?.points || [], selected.year, selected.month);
    const mainMetric = primary ? formatValue(primary.value, indicator.unit, true) : 'Não disponível';
    const secondaryMetric = secondary ? `<span>${escapeHtml(datasets[1].name)}: <strong>${escapeHtml(formatValue(secondary.value, indicator.unit, true))}</strong></span>` : '';
    const periodLabel = primary ? formatPeriod(primary.period) : `Sem dados em ${selected.period ? formatPeriod(selected.period) : 'período fechado'}`;
    return `<a class="overview-card" href="#${encodeURIComponent(indicator.id)}"><div class="overview-card__top"><span class="overview-card__rank">${String(indicator.priority).padStart(2, '0')}</span><h2>${escapeHtml(indicator.title)}</h2></div><p class="overview-card__metric">${escapeHtml(datasets[0]?.name || '')}${datasets[0]?.name ? ': ' : ''}${escapeHtml(mainMetric)}</p><div class="overview-card__meta"><span>${escapeHtml(periodLabel)}</span>${previous ? changeBadge(primary.value, previous.value, indicator.unit) : ''}${secondaryMetric}</div></a>`;
  }).join('');
  const selectedLabel = selected.period ? formatPeriod(selected.period) : 'nenhum período';
  return `${pageHeader({ title: 'Visão geral' }, `Indicadores prioritários em ${selectedLabel}, comparados com o mesmo mês do ano anterior.`)}${periodFilters(selected)}<div class="closed-period-note"><span aria-hidden="true">✓</span><p><strong>Somente meses fechados</strong><br>O mês em andamento não aparece nas opções desta visão.</p></div><div class="overview-grid">${cards || '<p>Nenhum indicador prioritário foi encontrado.</p>'}</div>${payload.unavailable?.length ? `<p class="quality-note">${payload.unavailable.length} indicador(es) configurado(s) não foram encontrados na planilha atual.</p>` : ''}`;
}

export function renderIndicator(indicator, currentPeriod, filter = {}) {
  switch (indicator.kind) {
    case 'monthly': return renderMonthly(indicator, referencePeriod(currentPeriod), filter);
    case 'annual-categories': return renderAnnualCategories(indicator, filter);
    case 'annual-series': return renderAnnualSeries(indicator, filter);
    case 'facts': return renderFacts(indicator);
    case 'category-months': return renderCategoryMonths(indicator, filter);
    case 'quarterly-categories': return renderQuarterly(indicator, filter);
    case 'events': return renderEvents(indicator, filter);
    default: return `${pageHeader(indicator, '')}${periodFilters({})}<p class="status-message">Este formato de indicador ainda não possui visualização.</p>${metadata(indicator)}`;
  }
}

function renderMonthly(indicator, currentPeriod, filter) {
  const selectedFilter = monthlyFilter(indicator.datasets.flatMap(dataset => dataset.points), filter);
  const selectedPeriod = selectedFilter.period;
  const blocks = indicator.datasets.map(dataset => {
    const selected = pointAt(dataset.points, selectedFilter.year, selectedFilter.month);
    const priorYear = selected ? pointAt(dataset.points, selected.year - 1, selected.month) : null;
    const priorMonth = selectedPeriod ? sortedPoints(dataset.points).filter(point => point.period < selectedPeriod).pop() || null : null;
    const comparable = comparableAggregate(dataset, selected, indicator.aggregation);
    const unitLabel = indicator.aggregation === 'average' ? 'Média comparável' : 'Acumulado comparável';
    const kpis = [
      card(dataset.name, selected?.value, indicator.unit, selectedPeriod ? formatPeriod(selectedPeriod) : '', priorYear && selected ? `${changeBadge(selected.value, priorYear.value, indicator.unit)}<p class="kpi-card__period">Mesmo mês de ${priorYear.year}: ${escapeHtml(formatValue(priorYear.value, indicator.unit))}</p>` : ''),
      priorMonth && selected ? card('Período anterior com dados', priorMonth.value, indicator.unit, formatPeriod(priorMonth.period), changeBadge(selected.value, priorMonth.value, indicator.unit)) : '',
      comparable ? card(unitLabel, comparable.current, indicator.unit, `${comparable.months} mês(es) comparáveis em ${selected.year}`, `${changeBadge(comparable.current, comparable.previous, indicator.unit)}<p class="kpi-card__period">Mesmo recorte de ${selected.year - 1}: ${escapeHtml(formatValue(comparable.previous, indicator.unit))}</p>`) : ''
    ].join('');

    const currentPoints = Array.from({ length: 12 }, (_, index) => pointAt(dataset.points, selectedFilter.year, index + 1)?.value ?? null);
    const previousPoints = Array.from({ length: 12 }, (_, index) => pointAt(dataset.points, selectedFilter.year - 1, index + 1)?.value ?? null);
    const line = lineChart({
      labels: Array.from({ length: 12 }, (_, index) => monthShort(index + 1)),
      series: [{ name: String(selectedFilter.year), values: currentPoints }, { name: String(selectedFilter.year - 1), values: previousPoints }],
      unit: indicator.unit,
      description: `${dataset.name}: comparação mensal entre ${selectedFilter.year} e ${selectedFilter.year - 1}`
    });
    const bars = barChart({
      items: currentPoints.map((value, index) => ({ label: monthShort(index + 1), value })),
      unit: indicator.unit,
      description: `${dataset.name} por mês em ${selectedFilter.year}`
    });
    const rows = Array.from({ length: 12 }, (_, index) => {
      const current = currentPoints[index], previous = previousPoints[index];
      const absolute = valid(current) && valid(previous) ? current - previous : null;
      const relative = valid(current) && valid(previous) ? relativeChange(current, previous) : null;
      const variation = indicator.unit === 'percent' && valid(absolute)
        ? `${absolute >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(absolute * 100)} p.p.`
        : relative === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' }).format(relative);
      return `<tr><td>${monthShort(index + 1)}</td><td>${escapeHtml(formatValue(current, indicator.unit))}</td><td>${escapeHtml(formatValue(previous, indicator.unit))}</td><td>${escapeHtml(variation)}</td></tr>`;
    }).join('');
    return `<section aria-labelledby="dataset-${escapeHtml(indicator.id)}-${escapeHtml(dataset.name)}"><h2 class="sr-only" id="dataset-${escapeHtml(indicator.id)}-${escapeHtml(dataset.name)}">${escapeHtml(dataset.name)}</h2><div class="kpi-grid">${kpis}</div><div class="section-grid section-grid--two"><article class="panel"><h2>Evolução mensal</h2><p class="panel__subtitle">${selectedFilter.year} e ${selectedFilter.year - 1}</p>${line}</article><article class="panel"><h2>${escapeHtml(String(selectedFilter.year))}</h2><p class="panel__subtitle">Valores mensais disponíveis</p>${bars}</article></div><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>${escapeHtml(dataset.name)} — comparação mensal</caption><thead><tr><th>Mês</th><th>${selectedFilter.year}</th><th>${selectedFilter.year - 1}</th><th>Variação anual</th></tr></thead><tbody>${rows}</tbody></table></div></article></section>`;
  }).join('');
  const partialNote = selectedPeriod === currentPeriod
    ? '<div class="partial-period-note"><span class="pill pill--partial">Período em andamento</span><p>O mês atual pode aparecer nesta análise detalhada, mas não é usado nos cartões da visão geral até seu fechamento.</p></div>'
    : '';
  const selectedLabel = selectedPeriod ? formatPeriod(selectedPeriod) : 'sem período disponível';
  return `${pageHeader(indicator, `Período selecionado: ${selectedLabel}. Dados disponíveis até ${formatPeriod(indicator.dataThrough)}.`)}${periodFilters(selectedFilter)}${partialNote}${blocks}${metadata(indicator)}`;
}

function renderAnnualCategories(indicator, filter) {
  const years = [...new Set(indicator.points.map(point => point.year))].sort((a, b) => a - b);
  const selected = annualFilter(years, filter);
  const previousYear = selected.year - 1;
  const selectedItems = indicator.points.filter(point => point.year === selected.year);
  const cards = selectedItems.map(point => {
    const previous = indicator.points.find(item => item.year === previousYear && item.category === point.category);
    return card(point.category, point.value, indicator.unit, String(selected.year), previous ? `${changeBadge(point.value, previous.value, 'percent')}<p class="kpi-card__period">${previousYear}: ${escapeHtml(formatValue(previous.value, indicator.unit))}</p>` : '');
  }).join('');
  const rows = indicator.categories.map(category => `<tr><td>${escapeHtml(category)}</td>${years.map(year => `<td>${escapeHtml(formatValue(indicator.points.find(point => point.year === year && point.category === category)?.value, indicator.unit))}</td>`).join('')}</tr>`).join('');
  return `${pageHeader(indicator, `Composição amostral informada pelos visitantes em ${selected.year}.`)}${periodFilters(selected)}<div class="kpi-grid">${cards}</div><div class="section-grid section-grid--two"><article class="panel"><h2>Composição em ${selected.year}</h2>${donutChart({ items: selectedItems.map(point => ({ label: point.category, value: point.value })), unit: indicator.unit, description: `Origem dos visitantes em ${selected.year}` })}</article><article class="panel"><h2>Comparação por origem</h2>${barChart({ items: selectedItems.map(point => ({ label: point.category, value: point.value })), unit: indicator.unit, description: `Participação por origem em ${selected.year}` })}</article></div><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>Participação por ano</caption><thead><tr><th>Origem</th>${years.map(year => `<th>${year}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderAnnualSeries(indicator, filter) {
  const years = [...new Set(indicator.datasets.flatMap(dataset => dataset.points.map(point => point.year)))].sort((a, b) => a - b);
  const selected = annualFilter(years, filter);
  const kpis = indicator.datasets.map(dataset => {
    const focus = dataset.points.find(point => point.year === selected.year);
    const previous = dataset.points.find(point => point.year === selected.year - 1);
    return focus ? card(dataset.name, focus.value, indicator.unit, String(focus.year), previous ? `${changeBadge(focus.value, previous.value, indicator.unit)}<p class="kpi-card__period">Ano anterior (${previous.year}): ${escapeHtml(formatValue(previous.value, indicator.unit))}</p>` : '') : card(dataset.name, null, indicator.unit, String(selected.year));
  }).join('');
  const chart = lineChart({ labels: years.map(String), series: indicator.datasets.map(dataset => ({ name: dataset.name, values: years.map(year => dataset.points.find(point => point.year === year)?.value ?? null) })), unit: indicator.unit, description: `${indicator.title} por ano` });
  const rows = years.map(year => `<tr><td>${year}</td>${indicator.datasets.map(dataset => `<td>${escapeHtml(formatValue(dataset.points.find(point => point.year === year)?.value, indicator.unit))}</td>`).join('')}</tr>`).join('');
  return `${pageHeader(indicator, `Ano selecionado: ${selected.year}. Anos ausentes não são interpolados.`)}${periodFilters(selected)}<div class="kpi-grid">${kpis}</div><article class="panel"><h2>Evolução anual</h2>${chart}</article><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>${escapeHtml(indicator.title)}</caption><thead><tr><th>Ano</th>${indicator.datasets.map(dataset => `<th>${escapeHtml(dataset.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderFacts(indicator) {
  const facts = indicator.facts.map(fact => {
    const label = fact.label.toLowerCase();
    const unit = label.includes('pib') ? 'currency' : 'count';
    const value = label === 'idhm' ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(fact.value)) : formatValue(Number(fact.value), unit, true);
    return `<article class="fact-card"><p>${escapeHtml(fact.label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(fact.source)}</small></article>`;
  }).join('');
  const rows = indicator.facts.map(fact => `<tr><td>${escapeHtml(fact.label)}</td><td>${escapeHtml(String(fact.value))}</td><td>${escapeHtml(fact.source)}</td></tr>`).join('');
  return `${pageHeader(indicator, 'Indicadores de contexto com anos de referência próprios, conforme a fonte de cada registro.')} ${periodFilters({})}<p class="filter-explanation">Esta aba não possui campos estruturados de ano e mês para aplicar filtros seguros.</p><div class="facts-grid">${facts}</div><article class="panel"><h2>Dados e fontes</h2><div class="table-wrap"><table><caption>Dados gerais do município</caption><thead><tr><th>Dado</th><th>Valor de origem</th><th>Fonte</th></tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderCategoryMonths(indicator, filter) {
  const periods = [...new Set(indicator.points.filter(point => valid(point.value)).map(point => point.period))].sort();
  const selected = monthlyFilter(indicator.points, filter);
  const selectedPeriod = selected.period;
  const previousPeriod = periods.filter(period => period < selectedPeriod).pop();
  const valuesAt = period => indicator.points.filter(point => point.period === period && valid(point.value));
  const selectedItems = valuesAt(selectedPeriod);
  const selectedTotal = aggregate(selectedItems.map(item => item.value), 'sum');
  const previousTotal = aggregate(valuesAt(previousPeriod).map(item => item.value), 'sum');
  const yearPeriods = periods.filter(period => Number(period.slice(0, 4)) === selected.year);
  const monthlyTotals = yearPeriods.map(period => ({ label: monthShort(Number(period.slice(5))), value: aggregate(valuesAt(period).map(item => item.value), 'sum') }));
  const rows = [...selectedItems].sort((a, b) => b.value - a.value).map(item => `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(formatValue(item.value, 'count'))}</td></tr>`).join('');
  const comparison = previousTotal !== null && selectedTotal !== null ? `${changeBadge(selectedTotal, previousTotal, 'count')}<p class="kpi-card__period">Período anterior com dados: ${escapeHtml(formatValue(previousTotal, 'count'))}</p>` : '';
  return `${pageHeader(indicator, `Período selecionado: ${formatPeriod(selectedPeriod)}. Dados disponíveis até ${formatPeriod(indicator.dataThrough)}.`)}${periodFilters(selected)}<div class="kpi-grid">${card('Total no mês selecionado', selectedTotal, 'count', formatPeriod(selectedPeriod), comparison)}${card('Canais e locais com dados', selectedItems.length, 'count', formatPeriod(selectedPeriod))}</div><div class="section-grid section-grid--two"><article class="panel"><h2>Total mensal em ${selected.year}</h2>${barChart({ items: monthlyTotals, unit: 'count', description: `Atendimentos totais por mês em ${selected.year}` })}</article><article class="panel"><h2>Composição do mês selecionado</h2>${barChart({ items: [...selectedItems].sort((a, b) => b.value - a.value).map(item => ({ label: item.category, value: item.value })), unit: 'count', description: `Atendimentos por canal em ${formatPeriod(selectedPeriod)}`, limit: 10 })}</article></div><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>${escapeHtml(formatPeriod(selectedPeriod))}</caption><thead><tr><th>Canal ou local</th><th>Atendimentos</th></tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderQuarterly(indicator, filter) {
  const availablePeriods = [...new Set(indicator.points.filter(point => valid(point.value)).map(point => point.period))].sort();
  const selectedYear = annualFilter(indicator.points.map(point => point.year), filter);
  const period = availablePeriods.filter(value => Number(value.slice(0, 4)) === selectedYear.year).pop();
  const previousPeriod = availablePeriods[availablePeriods.indexOf(period) - 1];
  const latest = indicator.points.filter(point => point.period === period && valid(point.value)).sort((a, b) => b.value - a.value);
  const previous = indicator.points.filter(point => point.period === previousPeriod && valid(point.value));
  const top = latest[0];
  const cards = `${card('Período mais recente', latest.length, 'count', `${formatPeriod(period)} — categorias com valor`)}${top ? card('Maior categoria', top.value, 'count', top.category, changeBadge(top.value, previous.find(item => item.category === top.category)?.value, 'count')) : ''}`;
  const rows = latest.map(point => {
    const old = previous.find(item => item.category === point.category);
    return `<tr><td>${escapeHtml(point.category)}</td><td>${escapeHtml(formatValue(point.value, 'count'))}</td><td>${escapeHtml(formatValue(old?.value, 'count'))}</td><td>${old ? changeBadge(point.value, old.value, 'count') : '—'}</td></tr>`;
  }).join('');
  return `${pageHeader(indicator, `Último trimestre disponível em ${selectedYear.year}: ${formatPeriod(period)}. Os marcadores “x” e células vazias não são tratados como zero.`)}${periodFilters({ ...selectedYear, monthLabel: 'Não se aplica (trimestral)' })}<div class="kpi-grid">${cards}</div><article class="panel"><h2>Categorias no período selecionado</h2>${barChart({ items: latest.map(point => ({ label: point.category, value: point.value })), unit: 'count', description: `Cadastur por categoria em ${formatPeriod(period)}`, limit: 12 })}</article><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>${escapeHtml(formatPeriod(period))} e período anterior</caption><thead><tr><th>Categoria</th><th>${escapeHtml(formatPeriod(period))}</th><th>${escapeHtml(formatPeriod(previousPeriod))}</th><th>Variação</th></tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderEvents(indicator, filter) {
  const eventPoints = indicator.monthCounts.map(item => ({ ...item, year: Number(item.period.slice(0, 4)), month: Number(item.period.slice(5)) }));
  const selected = monthlyFilter(eventPoints, filter);
  const focus = pointAt(eventPoints, selected.year, selected.month);
  const priorYear = pointAt(eventPoints, selected.year - 1, selected.month);
  const yearItems = eventPoints.filter(item => item.year === selected.year);
  const busiest = [...yearItems].sort((a, b) => b.value - a.value)[0];
  const monthTypes = indicator.monthTypeCounts?.find(item => item.period === selected.period)?.items || [];
  const topType = monthTypes[0];
  const cards = `${card('Eventos no mês selecionado', focus?.value, 'count', formatPeriod(selected.period), priorYear && focus ? `${changeBadge(focus.value, priorYear.value, 'count')}<p class="kpi-card__period">Mesmo mês de ${priorYear.year}: ${escapeHtml(formatValue(priorYear.value, 'count'))}</p>` : '')}${busiest ? card('Maior mês do ano', busiest.value, 'count', formatPeriod(busiest.period)) : ''}${topType ? card('Tipo mais frequente no mês', topType.value, 'count', topType.label) : ''}`;
  const monthRows = Array.from({ length: 12 }, (_, index) => {
    const current = pointAt(eventPoints, selected.year, index + 1);
    const previous = pointAt(eventPoints, selected.year - 1, index + 1);
    return `<tr><td>${monthShort(index + 1)}</td><td>${escapeHtml(formatValue(current?.value, 'count'))}</td><td>${escapeHtml(formatValue(previous?.value, 'count'))}</td><td>${current && previous ? changeBadge(current.value, previous.value, 'count') : '—'}</td></tr>`;
  }).join('');
  const quality = indicator.quality?.invalidDateRanges || indicator.quality?.duplicateRows ? `<p class="quality-note">A base contém ${indicator.quality.invalidDateRanges} registro(s) com data final anterior à inicial e ${indicator.quality.duplicateRows} repetição(ões) exata(s) após a primeira ocorrência. Os totais preservam a base original.</p>` : '';
  const typeItems = monthTypes.length ? monthTypes : indicator.typeCounts;
  const typeSubtitle = monthTypes.length ? formatPeriod(selected.period) : 'Cópia antiga do cache: totais da base completa';
  return `${pageHeader(indicator, `Contagem por data de início em ${formatPeriod(selected.period)}. Não representa público estimado ou realizado.`)}${periodFilters(selected)}<div class="kpi-grid">${cards}</div>${quality}<div class="section-grid section-grid--two"><article class="panel"><h2>Eventos por mês em ${selected.year}</h2>${barChart({ items: yearItems.map(item => ({ label: monthShort(item.month), value: item.value })), unit: 'count', description: `Eventos cadastrados por mês de início em ${selected.year}` })}</article><article class="panel"><h2>Principais tipos</h2><p class="panel__subtitle">${escapeHtml(typeSubtitle)}</p>${barChart({ items: typeItems, unit: 'count', description: `Eventos por tipo em ${typeSubtitle}`, limit: 10 })}</article></div><article class="panel"><h2>Tabela-resumo mensal</h2><div class="table-wrap"><table><caption>${selected.year} e ${selected.year - 1}</caption><thead><tr><th>Mês</th><th>${selected.year}</th><th>${selected.year - 1}</th><th>Variação anual</th></tr></thead><tbody>${monthRows}</tbody></table></div></article>${metadata(indicator)}`;
}
