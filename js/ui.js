import { barChart, donutChart, lineChart } from './charts.js';
import { changeBadge, escapeHtml, formatPeriod, formatValue, monthShort, relativeChange } from './format.js';

function valid(value) { return typeof value === 'number' && Number.isFinite(value); }
function sortedPoints(points) { return [...points].filter(point => valid(point.value)).sort((a, b) => String(a.period).localeCompare(String(b.period))); }
function latestPoint(points) { const sorted = sortedPoints(points); return sorted[sorted.length - 1] || null; }
function pointAt(points, year, month) { return points.find(point => point.year === year && point.month === month && valid(point.value)) || null; }

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

export function renderOverview(payload) {
  const priorities = payload.indicators.filter(item => item.priority).sort((a, b) => a.priority - b.priority);
  const cards = priorities.map(indicator => {
    const datasets = indicator.datasets || [];
    const primary = latestPoint(datasets[0]?.points || []);
    const previous = primary ? pointAt(datasets[0].points, primary.year - 1, primary.month) : null;
    const secondary = latestPoint(datasets[1]?.points || []);
    const mainMetric = primary ? formatValue(primary.value, indicator.unit, true) : 'Não disponível';
    const secondaryMetric = secondary ? `<span>${escapeHtml(datasets[1].name)}: <strong>${escapeHtml(formatValue(secondary.value, indicator.unit, true))}</strong></span>` : '';
    return `<a class="overview-card" href="#${encodeURIComponent(indicator.id)}"><div class="overview-card__top"><span class="overview-card__rank">${String(indicator.priority).padStart(2, '0')}</span><h2>${escapeHtml(indicator.title)}</h2></div><p class="overview-card__metric">${escapeHtml(datasets[0]?.name || '')}${datasets[0]?.name ? ': ' : ''}${escapeHtml(mainMetric)}</p><div class="overview-card__meta"><span>${escapeHtml(primary ? formatPeriod(primary.period) : 'Sem período disponível')}</span>${previous ? changeBadge(primary.value, previous.value, indicator.unit) : ''}${secondaryMetric}</div></a>`;
  }).join('');
  return `${pageHeader({ title: 'Visão geral' }, 'Último período disponível de cada indicador prioritário e comparação com o mesmo mês do ano anterior.')}<div class="overview-grid">${cards || '<p>Nenhum indicador prioritário foi encontrado.</p>'}</div>${payload.unavailable?.length ? `<p class="quality-note">${payload.unavailable.length} indicador(es) configurado(s) não foram encontrados na planilha atual.</p>` : ''}`;
}

export function renderIndicator(indicator) {
  switch (indicator.kind) {
    case 'monthly': return renderMonthly(indicator);
    case 'annual-categories': return renderAnnualCategories(indicator);
    case 'annual-series': return renderAnnualSeries(indicator);
    case 'facts': return renderFacts(indicator);
    case 'category-months': return renderCategoryMonths(indicator);
    case 'quarterly-categories': return renderQuarterly(indicator);
    case 'events': return renderEvents(indicator);
    default: return `${pageHeader(indicator, '')}<p class="status-message">Este formato de indicador ainda não possui visualização.</p>${metadata(indicator)}`;
  }
}

function renderMonthly(indicator) {
  const blocks = indicator.datasets.map(dataset => {
    const latest = latestPoint(dataset.points);
    if (!latest) return `<section class="panel"><h2>${escapeHtml(dataset.name)}</h2><div class="chart-empty">Não há valores disponíveis.</div></section>`;
    const priorYear = pointAt(dataset.points, latest.year - 1, latest.month);
    const priorMonth = sortedPoints(dataset.points).filter(point => point.period < latest.period).pop() || null;
    const comparable = comparableAggregate(dataset, latest, indicator.aggregation);
    const unitLabel = indicator.aggregation === 'average' ? 'Média comparável' : 'Acumulado comparável';
    const kpis = [
      card(dataset.name, latest.value, indicator.unit, formatPeriod(latest.period), priorYear ? `${changeBadge(latest.value, priorYear.value, indicator.unit)}<p class="kpi-card__period">Mesmo mês de ${priorYear.year}: ${escapeHtml(formatValue(priorYear.value, indicator.unit))}</p>` : ''),
      priorMonth ? card('Período anterior', priorMonth.value, indicator.unit, formatPeriod(priorMonth.period), changeBadge(latest.value, priorMonth.value, indicator.unit)) : '',
      comparable ? card(unitLabel, comparable.current, indicator.unit, `${comparable.months} mês(es) comparáveis em ${latest.year}`, `${changeBadge(comparable.current, comparable.previous, indicator.unit)}<p class="kpi-card__period">Mesmo recorte de ${latest.year - 1}: ${escapeHtml(formatValue(comparable.previous, indicator.unit))}</p>`) : ''
    ].join('');

    const currentPoints = Array.from({ length: 12 }, (_, index) => pointAt(dataset.points, latest.year, index + 1)?.value ?? null);
    const previousPoints = Array.from({ length: 12 }, (_, index) => pointAt(dataset.points, latest.year - 1, index + 1)?.value ?? null);
    const line = lineChart({
      labels: Array.from({ length: 12 }, (_, index) => monthShort(index + 1)),
      series: [{ name: String(latest.year), values: currentPoints }, { name: String(latest.year - 1), values: previousPoints }],
      unit: indicator.unit,
      description: `${dataset.name}: comparação mensal entre ${latest.year} e ${latest.year - 1}`
    });
    const bars = barChart({
      items: currentPoints.map((value, index) => ({ label: monthShort(index + 1), value })),
      unit: indicator.unit,
      description: `${dataset.name} por mês em ${latest.year}`
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
    return `<section aria-labelledby="dataset-${escapeHtml(indicator.id)}-${escapeHtml(dataset.name)}"><h2 class="sr-only" id="dataset-${escapeHtml(indicator.id)}-${escapeHtml(dataset.name)}">${escapeHtml(dataset.name)}</h2><div class="kpi-grid">${kpis}</div><div class="section-grid section-grid--two"><article class="panel"><h2>Evolução mensal</h2><p class="panel__subtitle">Ano mais recente e ano anterior</p>${line}</article><article class="panel"><h2>${escapeHtml(String(latest.year))}</h2><p class="panel__subtitle">Valores mensais disponíveis</p>${bars}</article></div><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>${escapeHtml(dataset.name)} — comparação mensal</caption><thead><tr><th>Mês</th><th>${latest.year}</th><th>${latest.year - 1}</th><th>Variação anual</th></tr></thead><tbody>${rows}</tbody></table></div></article></section>`;
  }).join('');
  return `${pageHeader(indicator, `Dados até ${formatPeriod(indicator.dataThrough)}. Zeros finais do ano mais recente sem observação posterior são tratados como ausência de dados.`)}${blocks}${metadata(indicator)}`;
}

function renderAnnualCategories(indicator) {
  const years = [...new Set(indicator.points.map(point => point.year))].sort((a, b) => a - b);
  const latestYear = years[years.length - 1];
  const previousYear = years[years.length - 2];
  const latest = indicator.points.filter(point => point.year === latestYear);
  const cards = latest.map(point => {
    const previous = indicator.points.find(item => item.year === previousYear && item.category === point.category);
    return card(point.category, point.value, indicator.unit, String(latestYear), previous ? `${changeBadge(point.value, previous.value, 'percent')}<p class="kpi-card__period">${previousYear}: ${escapeHtml(formatValue(previous.value, indicator.unit))}</p>` : '');
  }).join('');
  const rows = indicator.categories.map(category => `<tr><td>${escapeHtml(category)}</td>${years.map(year => `<td>${escapeHtml(formatValue(indicator.points.find(point => point.year === year && point.category === category)?.value, indicator.unit))}</td>`).join('')}</tr>`).join('');
  return `${pageHeader(indicator, `Composição amostral informada pelos visitantes. Último ano disponível: ${latestYear}.`)}<div class="kpi-grid">${cards}</div><div class="section-grid section-grid--two"><article class="panel"><h2>Composição em ${latestYear}</h2>${donutChart({ items: latest.map(point => ({ label: point.category, value: point.value })), unit: indicator.unit, description: `Origem dos visitantes em ${latestYear}` })}</article><article class="panel"><h2>Comparação por origem</h2>${barChart({ items: latest.map(point => ({ label: point.category, value: point.value })), unit: indicator.unit, description: `Participação por origem em ${latestYear}` })}</article></div><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>Participação por ano</caption><thead><tr><th>Origem</th>${years.map(year => `<th>${year}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderAnnualSeries(indicator) {
  const years = [...new Set(indicator.datasets.flatMap(dataset => dataset.points.map(point => point.year)))].sort((a, b) => a - b);
  const kpis = indicator.datasets.map(dataset => {
    const points = sortedPoints(dataset.points);
    const latest = points[points.length - 1], previous = points[points.length - 2];
    return latest ? card(dataset.name, latest.value, indicator.unit, String(latest.year), previous ? `${changeBadge(latest.value, previous.value, indicator.unit)}<p class="kpi-card__period">Observação anterior (${previous.year}): ${escapeHtml(formatValue(previous.value, indicator.unit))}</p>` : '') : '';
  }).join('');
  const chart = lineChart({ labels: years.map(String), series: indicator.datasets.map(dataset => ({ name: dataset.name, values: years.map(year => dataset.points.find(point => point.year === year)?.value ?? null) })), unit: indicator.unit, description: `${indicator.title} por ano` });
  const rows = years.map(year => `<tr><td>${year}</td>${indicator.datasets.map(dataset => `<td>${escapeHtml(formatValue(dataset.points.find(point => point.year === year)?.value, indicator.unit))}</td>`).join('')}</tr>`).join('');
  return `${pageHeader(indicator, 'Série anual conforme os períodos existentes na planilha; anos ausentes não são interpolados.')}<div class="kpi-grid">${kpis}</div><article class="panel"><h2>Evolução anual</h2>${chart}</article><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>${escapeHtml(indicator.title)}</caption><thead><tr><th>Ano</th>${indicator.datasets.map(dataset => `<th>${escapeHtml(dataset.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderFacts(indicator) {
  const facts = indicator.facts.map(fact => {
    const label = fact.label.toLowerCase();
    const unit = label.includes('pib') ? 'currency' : 'count';
    const value = label === 'idhm' ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(fact.value)) : formatValue(Number(fact.value), unit, true);
    return `<article class="fact-card"><p>${escapeHtml(fact.label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(fact.source)}</small></article>`;
  }).join('');
  const rows = indicator.facts.map(fact => `<tr><td>${escapeHtml(fact.label)}</td><td>${escapeHtml(String(fact.value))}</td><td>${escapeHtml(fact.source)}</td></tr>`).join('');
  return `${pageHeader(indicator, 'Indicadores de contexto com anos de referência próprios, conforme a fonte de cada registro.')}<div class="facts-grid">${facts}</div><article class="panel"><h2>Dados e fontes</h2><div class="table-wrap"><table><caption>Dados gerais do município</caption><thead><tr><th>Dado</th><th>Valor de origem</th><th>Fonte</th></tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderCategoryMonths(indicator) {
  const periods = [...new Set(indicator.points.filter(point => valid(point.value)).map(point => point.period))].sort();
  const latestPeriod = periods[periods.length - 1];
  const previousPeriod = periods[periods.length - 2];
  const valuesAt = period => indicator.points.filter(point => point.period === period && valid(point.value));
  const latestItems = valuesAt(latestPeriod);
  const latestTotal = aggregate(latestItems.map(item => item.value), 'sum');
  const previousTotal = aggregate(valuesAt(previousPeriod).map(item => item.value), 'sum');
  const monthlyTotals = periods.map(period => ({ label: monthShort(Number(period.slice(5))), value: aggregate(valuesAt(period).map(item => item.value), 'sum') }));
  const rows = latestItems.sort((a, b) => b.value - a.value).map(item => `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(formatValue(item.value, 'count'))}</td></tr>`).join('');
  return `${pageHeader(indicator, `Dados até ${formatPeriod(latestPeriod)}. A planilha contém apenas ${indicator.points[0]?.year || ''}.`)}<div class="kpi-grid">${card('Total no último mês', latestTotal, 'count', formatPeriod(latestPeriod), previousTotal !== null ? `${changeBadge(latestTotal, previousTotal, 'count')}<p class="kpi-card__period">Período anterior: ${escapeHtml(formatValue(previousTotal, 'count'))}</p>` : '')}${card('Canais e locais com dados', latestItems.length, 'count', formatPeriod(latestPeriod))}</div><div class="section-grid section-grid--two"><article class="panel"><h2>Total mensal</h2>${barChart({ items: monthlyTotals, unit: 'count', description: 'Atendimentos totais por mês' })}</article><article class="panel"><h2>Composição do último mês</h2>${barChart({ items: latestItems.sort((a, b) => b.value - a.value).map(item => ({ label: item.category, value: item.value })), unit: 'count', description: `Atendimentos por canal em ${formatPeriod(latestPeriod)}`, limit: 10 })}</article></div><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>${escapeHtml(formatPeriod(latestPeriod))}</caption><thead><tr><th>Canal ou local</th><th>Atendimentos</th></tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderQuarterly(indicator) {
  const period = indicator.dataThrough;
  const availablePeriods = [...new Set(indicator.points.filter(point => valid(point.value)).map(point => point.period))].sort();
  const previousPeriod = availablePeriods[availablePeriods.indexOf(period) - 1];
  const latest = indicator.points.filter(point => point.period === period && valid(point.value)).sort((a, b) => b.value - a.value);
  const previous = indicator.points.filter(point => point.period === previousPeriod && valid(point.value));
  const top = latest[0];
  const cards = `${card('Período mais recente', latest.length, 'count', `${formatPeriod(period)} — categorias com valor`)}${top ? card('Maior categoria', top.value, 'count', top.category, changeBadge(top.value, previous.find(item => item.category === top.category)?.value, 'count')) : ''}`;
  const rows = latest.map(point => {
    const old = previous.find(item => item.category === point.category);
    return `<tr><td>${escapeHtml(point.category)}</td><td>${escapeHtml(formatValue(point.value, 'count'))}</td><td>${escapeHtml(formatValue(old?.value, 'count'))}</td><td>${old ? changeBadge(point.value, old.value, 'count') : '—'}</td></tr>`;
  }).join('');
  return `${pageHeader(indicator, `Dados até ${formatPeriod(period)}. Os marcadores “x” e células vazias não são tratados como zero.`)}<div class="kpi-grid">${cards}</div><article class="panel"><h2>Categorias no período mais recente</h2>${barChart({ items: latest.map(point => ({ label: point.category, value: point.value })), unit: 'count', description: `Cadastur por categoria em ${formatPeriod(period)}`, limit: 12 })}</article><article class="panel"><h2>Tabela-resumo</h2><div class="table-wrap"><table><caption>${escapeHtml(formatPeriod(period))} e período anterior</caption><thead><tr><th>Categoria</th><th>${escapeHtml(formatPeriod(period))}</th><th>${escapeHtml(formatPeriod(previousPeriod))}</th><th>Variação</th></tr></thead><tbody>${rows}</tbody></table></div></article>${metadata(indicator)}`;
}

function renderEvents(indicator) {
  const busiest = [...indicator.monthCounts].sort((a, b) => b.value - a.value)[0];
  const topType = indicator.typeCounts[0];
  const cards = `${card('Eventos cadastrados', indicator.total, 'count', 'Registros de 2026')}${busiest ? card('Mês com mais registros', busiest.value, 'count', formatPeriod(busiest.period)) : ''}${topType ? card('Tipo mais frequente', topType.value, 'count', topType.label) : ''}`;
  const monthRows = indicator.monthCounts.map(item => `<tr><td>${escapeHtml(formatPeriod(item.period))}</td><td>${escapeHtml(formatValue(item.value, 'count'))}</td></tr>`).join('');
  const quality = indicator.quality?.invalidDateRanges || indicator.quality?.duplicateRows ? `<p class="quality-note">A base contém ${indicator.quality.invalidDateRanges} registro(s) com data final anterior à inicial e ${indicator.quality.duplicateRows} repetição(ões) exata(s) após a primeira ocorrência. Os totais preservam a base original.</p>` : '';
  return `${pageHeader(indicator, 'Contagem de eventos cadastrados por data de início. Não representa público estimado ou realizado.')}<div class="kpi-grid">${cards}</div>${quality}<div class="section-grid section-grid--two"><article class="panel"><h2>Eventos por mês</h2>${barChart({ items: indicator.monthCounts.map(item => ({ label: monthShort(Number(item.period.slice(5))), value: item.value })), unit: 'count', description: 'Eventos cadastrados por mês de início' })}</article><article class="panel"><h2>Principais tipos</h2>${barChart({ items: indicator.typeCounts, unit: 'count', description: 'Eventos por tipo', limit: 10 })}</article></div><article class="panel"><h2>Tabela-resumo mensal</h2><div class="table-wrap"><table><caption>Registros por mês de início</caption><thead><tr><th>Mês</th><th>Eventos</th></tr></thead><tbody>${monthRows}</tbody></table></div></article>${metadata(indicator)}`;
}

