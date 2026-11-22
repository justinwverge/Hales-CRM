/**
 * HALE'S SERVICE NOTES — shared generator
 * ---------------------------------------
 * Same wording and order as the Service Call Notes tool in Hales-Tools.
 * Input: a plain object of field values (same names as the Hales-Tools form).
 * Output: the note text, ready to paste into FieldEdge.
 *
 * Anything that fills these fields — a tech on the CRM form, or later an
 * AI reading the job photos — produces a note in this exact format.
 *
 * TO CHANGE WORDING: edit the sentences in buildServiceNote() below.
 * TO CHANGE DROPDOWN CHOICES: edit NOTE_FIELDS. Keep the `value` strings,
 * the generator depends on them (e.g. 'chemically cleaned', 'in', 'pump').
 */
(function (root) {
  const BRANDS = ['Carrier', 'Trane', 'Lennox', 'Goodman', 'Rheem', 'American Standard', 'Bryant', 'Nordyne', 'Daikin', 'Other'];
  const TONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '5'];
  const o = (label, value) => ({ label, value: value === undefined ? label : value });
  const COND = [o('Clean', 'clean'), o('Slightly Dirty', 'slightly dirty'), o('Dirty - Chemically Cleaned', 'chemically cleaned'), o('Dirty - Needs Cleaning', 'dirty and needs to be cleaned')];
  const FILTER_COND = [o('Clean', 'clean'), o('Slightly Dirty', 'slightly dirty'), o('Dirty', 'dirty'), o('Very Dirty', 'very dirty'), o('Clogged', 'clogged')];
  const CAP = [o('In Spec', 'in'), o('Not In Spec', 'out'), o('Not In Spec - Replaced With Customer Approval', 'replaced')];
  const PROPER = [o('Operating Properly', 'properly'), o('Not Operating Properly', 'not properly')];
  const DRAIN = [o('Not Checked', 'none'), o('PVC Drain Line', 'pvc'), o('Condensate Pump', 'pump')];
  const TEMP = [o('Within Specs', 'within'), o('Not Within Specs', 'not within')];
  const REF = [o('Within Manufacturer Specifications', 'within'), o('Low - System Needs Refrigerant', 'low')];
  const REFMODE = [o('Cooling', 'cooling'), o('Heating', 'heating')];

  /** Form layout. `show` decides when a field appears; `def` is the default. */
  const NOTE_FIELDS = {
    header: [
      { id: 'call_type', label: 'Call type', type: 'select', def: 'cooling service', options: [o('Cooling Service Call', 'cooling service'), o('Heating Service Call', 'heating service')] },
      { id: 'area_of_home', label: 'Area of home', type: 'select', def: '', options: [o('—', ''), o('Upstairs', 'upstairs'), o('Main Level', 'main level'), o('Basement', 'basement'), o('Other', 'Other')] },
      { id: 'area_of_home_other', label: 'Area (other)', type: 'text', show: d => d.area_of_home === 'Other' },
      { id: 'system_type', label: 'System type', type: 'select', def: 'split', options: [o('Split System', 'split'), o('Mini Split', 'mini split'), o('Package Unit', 'package unit')] }
    ],
    indoor: [
      { id: 'in_year', label: 'Year', type: 'text' },
      { id: 'in_brand', label: 'Brand', type: 'select', def: 'Carrier', options: BRANDS.map(b => o(b)) },
      { id: 'in_brand_other', label: 'Brand (other)', type: 'text', show: d => d.in_brand === 'Other' },
      { id: 'in_type', label: 'Type', type: 'select', def: 'air handler', options: [o('Air Handler', 'air handler'), o('Furnace', 'furnace'), o('Dual Fuel (Furnace + Heat Pump)', 'dual fuel')] },
      { id: 'in_tons', label: 'Tons', type: 'select', def: '3', options: TONS.map(t => o(t)), show: d => !isFurnaceLike(d.in_type) },
      { id: 'in_btu', label: 'BTU', type: 'select', def: '60,000', options: ['40,000', '60,000', '80,000', '100,000', '120,000', '140,000'].map(b => o(b + ' BTU', b)).concat([o('Other', 'Other')]), show: d => isFurnaceLike(d.in_type) },
      { id: 'in_btu_other', label: 'BTU (other)', type: 'number', show: d => isFurnaceLike(d.in_type) && d.in_btu === 'Other' },
      { id: 'in_efficiency', label: 'Efficiency', type: 'select', def: '80%', options: [o('80%'), o('90%')], show: d => isFurnaceLike(d.in_type) },
      { id: 'in_coil_year', label: 'Coil year', type: 'text', show: d => isFurnaceLike(d.in_type) },
      { id: 'in_coil_brand', label: 'Coil brand', type: 'select', def: '', options: [o('-- Select --', '')].concat(BRANDS.map(b => o(b))), show: d => isFurnaceLike(d.in_type) },
      { id: 'in_coil_brand_other', label: 'Coil brand (other)', type: 'text', show: d => isFurnaceLike(d.in_type) && d.in_coil_brand === 'Other' },
      { id: 'in_coil_tons', label: 'Coil tons', type: 'select', def: '', options: [o('-- Select --', '')].concat(TONS.map(t => o(t))), show: d => isFurnaceLike(d.in_type) },
      { id: 'in_config', label: 'Configuration', type: 'select', def: 'upflow', options: [o('Upflow', 'upflow'), o('Downflow', 'downflow'), o('Horizontal Left', 'horizontal left'), o('Horizontal Right', 'horizontal right')] },
      { id: 'in_location', label: 'Location', type: 'select', def: 'attic', options: [o('Attic', 'attic'), o('Crawlspace', 'crawlspace'), o('Basement', 'basement'), o('Garage', 'garage'), o('Closet', 'closet'), o('Utility Room', 'utility room')] },
      { id: 'in_filter_loc', label: 'Filter location', type: 'select', def: 'at unit', options: [o('At Unit', 'at unit'), o('At Return Grille', 'at the return grille'), o('In Base', 'in the base'), o('In Ceiling', 'in the ceiling')] },
      { id: 'in_filter_size', label: 'Filter size', type: 'text' },
      { id: 'in_filter_cond', label: 'Filter condition', type: 'select', def: 'slightly dirty', options: FILTER_COND },
      { id: 'in_filter_action', label: 'Filter action', type: 'select', def: 'replaced', options: [o('Replaced', 'replaced'), o('Left in Place', 'left in place - within service life'), o('Customer to Replace', 'customer to replace')] },
      { id: 'in_coil', label: 'Indoor coil', type: 'select', def: 'clean', options: [o('-- Select --', '')].concat(COND, [o('Not Checked', 'not checked')]) },
      { id: 'in_blower', label: 'Blower wheel', type: 'select', def: 'clean', options: COND },
      { id: 'in_has_blower_cap', label: 'Blower capacitor', type: 'check' },
      { id: 'in_cap_spec', label: 'Blower cap rated MFD', type: 'text', show: d => d.in_has_blower_cap },
      { id: 'in_cap_actual', label: 'Blower cap measured', type: 'text', show: d => d.in_has_blower_cap },
      { id: 'in_cap_status', label: 'Blower cap status', type: 'select', def: 'in', options: CAP, show: d => d.in_has_blower_cap },
      { id: 'in_drain', label: 'Drain', type: 'select', def: 'pvc', options: DRAIN },
      { id: 'in_pressure_switch', label: 'Pressure switch tubing cleared', type: 'check', show: d => showFurnaceChecks(d) },
      { id: 'in_flame_sensor', label: 'Flame sensor cleaned', type: 'check', show: d => showFurnaceChecks(d) },
      { id: 'in_heat_exchanger', label: 'Heat exchanger tested, no cracks', type: 'check', show: d => showFurnaceChecks(d) },
      { id: 'in_heatstrips', label: 'Electric heat strips', type: 'check', show: d => !isFurnaceLike(d.in_type) },
      { id: 'in_heat_status', label: 'Heat strips', type: 'select', def: 'properly', options: PROPER, show: d => d.in_heatstrips && !isFurnaceLike(d.in_type) },
      { id: 'in_temp_return', label: 'Return temp', type: 'text' },
      { id: 'in_temp_supply', label: 'Supply temp', type: 'text' },
      { id: 'in_temp_status', label: 'Temp split', type: 'select', def: 'within', options: TEMP },
      { id: 'in_notes', label: 'Indoor notes', type: 'text' }
    ],
    outdoor: [
      { id: 'out_year', label: 'Year', type: 'text' },
      { id: 'out_brand', label: 'Brand', type: 'select', def: 'Carrier', options: BRANDS.map(b => o(b)) },
      { id: 'out_brand_other', label: 'Brand (other)', type: 'text', show: d => d.out_brand === 'Other' },
      { id: 'out_tons', label: 'Tons', type: 'select', def: '3', options: TONS.map(t => o(t)) },
      { id: 'out_type', label: 'Type', type: 'select', def: 'heat pump', options: [o('Heat Pump', 'heat pump'), o('Straight AC', 'straight AC')] },
      { id: 'out_coil', label: 'Outdoor coil', type: 'select', def: 'clean', options: COND },
      { id: 'out_contactor', label: 'Contactor', type: 'select', def: 'properly', options: [o('Operating Properly', 'properly'), o('Not Operating Properly', 'not properly'), o('Pitted - Should Be Replaced', 'pitted')] },
      { id: 'out_cap_spec', label: 'Capacitor rated MFD', type: 'text' },
      { id: 'out_cap_actual', label: 'Capacitor measured MFD', type: 'text' },
      { id: 'out_cap_status', label: 'Capacitor status', type: 'select', def: 'in', options: CAP },
      { id: 'out_defrost', label: 'Defrost tested', type: 'check' },
      { id: 'out_defrost_status', label: 'Defrost', type: 'select', def: 'properly', options: PROPER, show: d => d.out_defrost },
      { id: 'out_ref_mode', label: 'Pressures tested in', type: 'select', def: 'cooling', options: REFMODE },
      { id: 'out_ref_status', label: 'Refrigerant', type: 'select', def: 'within', options: REF },
      { id: 'out_ref_added_amount', label: 'Lbs added', type: 'text', show: d => d.out_ref_status === 'low' },
      { id: 'out_notes', label: 'Outdoor notes', type: 'text' }
    ],
    miniOutdoor: [
      { id: 'ms_out_year', label: 'Year', type: 'text' },
      { id: 'ms_out_brand', label: 'Brand', type: 'select', def: 'Daikin', options: BRANDS.map(b => o(b)) },
      { id: 'ms_out_brand_other', label: 'Brand (other)', type: 'text', show: d => d.ms_out_brand === 'Other' },
      { id: 'ms_out_btu', label: 'BTU', type: 'select', def: '24k', options: ['6k', '9k', '12k', '18k', '24k', '30k', '36k', '48k', 'Other'].map(b => o(b)) },
      { id: 'ms_out_btu_other', label: 'BTU (other)', type: 'text', show: d => d.ms_out_btu === 'Other' },
      { id: 'ms_out_coil', label: 'Outdoor coil', type: 'select', def: 'clean', options: COND },
      { id: 'ms_out_ref_mode', label: 'Pressures tested in', type: 'select', def: 'cooling', options: REFMODE },
      { id: 'ms_out_ref_status', label: 'Refrigerant', type: 'select', def: 'within', options: REF },
      { id: 'ms_out_ref_added_amount', label: 'Lbs added', type: 'text', show: d => d.ms_out_ref_status === 'low' },
      { id: 'ms_indoor_count', label: 'Indoor heads', type: 'select', def: '1', options: ['1', '2', '3', '4', '5', '6'].map(n => o(n)) }
    ],
    miniIndoor: i => [
      { id: `ms${i}_type`, label: 'Type', type: 'select', def: 'High Wall', options: ['High Wall', 'Ducted', 'Ceiling Cassette', 'Air Handler'].map(t => o(t)) },
      { id: `ms${i}_location`, label: 'Location', type: 'text' },
      { id: `ms${i}_year`, label: 'Year', type: 'text' },
      { id: `ms${i}_brand`, label: 'Brand', type: 'select', def: 'Daikin', options: BRANDS.map(b => o(b)) },
      { id: `ms${i}_brand_other`, label: 'Brand (other)', type: 'text', show: d => d[`ms${i}_brand`] === 'Other' },
      { id: `ms${i}_btu`, label: 'BTU', type: 'select', def: '12k', options: ['6k', '9k', '12k', '18k', '24k'].map(b => o(b)) },
      { id: `ms${i}_filter`, label: 'Filters', type: 'select', def: 'slightly dirty', options: FILTER_COND },
      { id: `ms${i}_filter_washed`, label: 'Filters washed', type: 'check' },
      { id: `ms${i}_coil`, label: 'Indoor coil', type: 'select', def: 'clean', options: COND.concat([o('Not Checked', 'not checked')]) },
      { id: `ms${i}_blower`, label: 'Blower wheel', type: 'select', def: 'clean', options: COND },
      { id: `ms${i}_drain`, label: 'Drain', type: 'select', def: 'pvc', options: DRAIN },
      { id: `ms${i}_temp_return`, label: 'Return temp', type: 'text' },
      { id: `ms${i}_temp_supply`, label: 'Supply temp', type: 'text' },
      { id: `ms${i}_temp_status`, label: 'Temp split', type: 'select', def: 'within', options: TEMP }
    ]
  };

  function isFurnaceLike(type) { return type === 'furnace' || type === 'dual fuel'; }
  function isHeatingCall(d) { return String(d.call_type || '').indexOf('heating') === 0; }
  function isOutdoorHidden(d) { return isHeatingCall(d) && d.in_type === 'furnace'; }
  function showFurnaceChecks(d) { return isHeatingCall(d) && isFurnaceLike(d.in_type); }

  function buildMiniSplitNote(d, locationLine) {
    const v = k => (d[k] === undefined || d[k] === null) ? '' : String(d[k]);
    const outYear = v('ms_out_year');
    const outBrand = v('ms_out_brand') === 'Other' ? (v('ms_out_brand_other') || 'Other') : v('ms_out_brand');
    const outBtu = v('ms_out_btu') === 'Other' ? (v('ms_out_btu_other') || 'Other') : v('ms_out_btu');
    const outCoil = v('ms_out_coil');
    const outRefMode = v('ms_out_ref_mode');
    const outRefStatus = v('ms_out_ref_status');
    const refAmount = v('ms_out_ref_added_amount');
    const outYearPart = outYear ? `${outYear} ` : '';

    let outdoor = `${outYearPart}${outBrand} ${outBtu} BTU mini split heat pump. `;
    outdoor += outCoil === 'chemically cleaned'
      ? `Outdoor coil was inspected, found dirty, and was chemically cleaned. `
      : outCoil === 'dirty and needs to be cleaned'
        ? `Outdoor coil was inspected, found dirty, and needs to be chemically cleaned. `
        : `Outdoor coil was inspected and is ${outCoil}. `;
    if (outRefStatus === 'within') {
      outdoor += `Refrigerant pressures were tested in ${outRefMode} and are within manufacturer specifications.`;
    } else if (refAmount) {
      outdoor += `Refrigerant pressures were tested in ${outRefMode} and were not within manufacturer specifications. System was found to be low on refrigerant. ${refAmount} lbs of refrigerant was added to bring the system back to manufacturer specifications.`;
    } else {
      outdoor += `Refrigerant pressures were tested in ${outRefMode} and are not within manufacturer specifications. System is low on refrigerant.`;
    }

    const count = parseInt(v('ms_indoor_count'), 10) || 1;
    let unitsText = '';
    for (let i = 1; i <= count; i++) {
      const type = v(`ms${i}_type`);
      const location = v(`ms${i}_location`);
      const year = v(`ms${i}_year`);
      const brand = v(`ms${i}_brand`) === 'Other' ? (v(`ms${i}_brand_other`) || 'Other') : v(`ms${i}_brand`);
      const btu = v(`ms${i}_btu`);
      const filter = v(`ms${i}_filter`);
      const coil = v(`ms${i}_coil`);
      const blower = v(`ms${i}_blower`);
      const drain = v(`ms${i}_drain`);
      const tempRet = v(`ms${i}_temp_return`);
      const tempSup = v(`ms${i}_temp_supply`);
      const tempSt = v(`ms${i}_temp_status`);
      const yearPart = year ? `${year} ` : '';
      const locationPart = location ? ` located in ${location}` : '';

      let unit = `${yearPart}${brand} ${btu} BTU ${type} unit${locationPart}. `;
      if (d[`ms${i}_filter_washed`]) {
        unit += filter === 'clean'
          ? `Washable filters were inspected and found clean. Filters were washed out and reinstalled. `
          : `Washable filters were inspected and found ${filter}. Filters were washed out, cleaned, and reinstalled. `;
      } else {
        unit += filter === 'clean'
          ? `Washable filters were inspected and are clean. `
          : `Washable filters were inspected and are ${filter}. `;
      }
      if (coil === 'chemically cleaned') unit += `Indoor coil was inspected, found dirty, and was chemically cleaned. `;
      else if (coil === 'dirty and needs to be cleaned') unit += `Indoor coil was inspected, found dirty, and needs to be chemically cleaned. `;
      else if (coil !== 'not checked') unit += `Indoor coil was inspected and is ${coil}. `;
      unit += blower === 'chemically cleaned'
        ? `Blower wheel was inspected, found dirty, and was chemically cleaned. `
        : blower === 'dirty and needs to be cleaned'
          ? `Blower wheel was inspected, found dirty, and needs to be cleaned. `
          : `Blower wheel was inspected and is ${blower}. `;
      if (drain === 'pump') unit += `Condensate pump was cleaned out, tested for operation, and treated with drain tablets. `;
      else if (drain === 'pvc') unit += `PVC condensate drain line was flushed and treated with drain tablets. `;
      if (tempRet && tempSup) unit += `System has a ${tempRet}-${tempSup} temperature split and is ${tempSt} specs.`;
      unit = unit.trim();
      const unitLabel = location || `Indoor Unit ${i}`;
      unitsText += `\n\n${unitLabel}\n${unit}`;
    }
    return `${locationLine}Outdoor\n${outdoor}${unitsText}`;
  }

  function buildServiceNote(d) {
    d = d || {};
    const v = k => (d[k] === undefined || d[k] === null) ? '' : String(d[k]);
    const chk = k => !!d[k];
    const areaOfHomeMap = { upstairs: 'Upstairs', 'main level': 'Main Level', basement: 'Basement' };
    const areaOfHome = v('area_of_home') === 'Other' ? v('area_of_home_other') : areaOfHomeMap[v('area_of_home')];
    const locationLine = areaOfHome ? `${areaOfHome}\n\n` : '';
    const systemType = v('system_type');

    if (systemType === 'mini split') return buildMiniSplitNote(d, '');
    if (systemType === 'package unit') return `${locationLine}Package Unit fields are coming soon.`;

    const inYear = v('in_year');
    const inBrand = v('in_brand') === 'Other' ? (v('in_brand_other') || 'Other') : v('in_brand');
    const inTons = v('in_tons');
    const inType = v('in_type');
    const inConfig = v('in_config');
    const inLocation = v('in_location');
    const inFilterLoc = v('in_filter_loc');
    const inFilterSize = v('in_filter_size');
    const inFilterCond = v('in_filter_cond');
    const inFilterAct = v('in_filter_action');
    const inCoil = v('in_coil');
    const inBlower = v('in_blower');
    const inCapSpec = v('in_cap_spec');
    const inCapActual = v('in_cap_actual');
    const inCapStatus = v('in_cap_status');
    const hasBlowerCap = chk('in_has_blower_cap');
    const inDrain = v('in_drain');
    const hasHeat = chk('in_heatstrips');
    const inHeatSt = v('in_heat_status');
    const inTempSup = v('in_temp_supply');
    const inTempRet = v('in_temp_return');
    const inTempSt = v('in_temp_status');
    const inNotes = v('in_notes');

    const isFurnace = isFurnaceLike(inType);
    const inTypeText = isFurnace ? 'furnace' : inType;
    const inBtu = v('in_btu') === 'Other' ? (v('in_btu_other') || 'Other') : v('in_btu');
    const inCoilYear = v('in_coil_year');
    const inCoilBrand = v('in_coil_brand') === 'Other' ? (v('in_coil_brand_other') || 'Other') : v('in_coil_brand');
    const inCoilTons = v('in_coil_tons');
    const inEfficiency = v('in_efficiency');
    const inSize = isFurnace ? `${inBtu} BTU ${inEfficiency}` : `${inTons} ton`;
    const inYearPart = inYear ? `${inYear} ` : '';
    const coilParts = [];
    if (inCoilYear) coilParts.push(inCoilYear);
    if (inCoilBrand) coilParts.push(inCoilBrand);
    if (inCoilTons) coilParts.push(`${inCoilTons} ton`);
    const hasCoilInfo = coilParts.length > 0;

    let indoor = '';
    if (isFurnace && hasCoilInfo) {
      indoor += `${inYearPart}${inBrand} ${inSize} ${inTypeText} and ${coilParts.join(' ')} indoor coil located in the ${inLocation} in ${inConfig} configuration. `;
    } else if (isFurnace) {
      indoor += `${inYearPart}${inBrand} ${inSize} ${inTypeText} located in the ${inLocation} in ${inConfig} configuration. `;
    } else {
      indoor += `${inYearPart}${inBrand} ${inSize} ${inType} located in the ${inLocation} in ${inConfig} configuration. `;
    }
    if (inFilterSize) {
      indoor += inFilterAct === 'customer to replace'
        ? `System is filtered ${inFilterLoc} with a ${inFilterSize} filter that was ${inFilterCond}. Customer to replace filter. `
        : `System is filtered ${inFilterLoc} with a ${inFilterSize} filter that was ${inFilterCond} and was ${inFilterAct}. `;
    }
    if (inCoil === 'chemically cleaned') indoor += `Indoor coil was inspected, found dirty, and was chemically cleaned. `;
    else if (inCoil && inCoil !== 'not checked') indoor += `Indoor coil was inspected and is ${inCoil}. `;
    indoor += inBlower === 'chemically cleaned'
      ? `Blower wheel was inspected, found dirty, and was chemically cleaned. `
      : `Blower wheel was inspected and is ${inBlower}. `;

    if (hasBlowerCap && inCapSpec && inCapActual) {
      if (inCapStatus === 'in') indoor += `Blower capacitor is a ${inCapSpec} MFD and measured ${inCapActual} and is in spec. `;
      else if (inCapStatus === 'replaced') indoor += `Blower capacitor is a ${inCapSpec} MFD and measured ${inCapActual} and is not in spec. Capacitor was replaced with customer approval. `;
      else indoor += `Blower capacitor is a ${inCapSpec} MFD and measured ${inCapActual} and is not in spec and should be replaced for continuous operation. `;
    }
    if (inDrain === 'pump') indoor += `Condensate pump was cleaned out, tested for operation, and treated with drain tablets. `;
    else if (inDrain === 'pvc') indoor += `PVC condensate drain line was flushed and treated with drain tablets. `;

    if (showFurnaceChecks(d)) {
      if (chk('in_pressure_switch')) indoor += `Pressure switch tubing was removed and cleared. `;
      if (chk('in_flame_sensor')) indoor += `Flame sensor was removed and cleaned. `;
      if (chk('in_heat_exchanger')) indoor += `Heat exchanger was tested for cracks, and none were observed. `;
    }
    if (hasHeat) {
      indoor += inHeatSt === 'properly'
        ? `Electric heat strips were tested for operation and are operating properly. `
        : `Electric heat strips were tested for operation and are not operating properly. `;
    }
    if (inTempRet && inTempSup) indoor += `System has a ${inTempRet}-${inTempSup} temperature split and is ${inTempSt} specs.`;
    indoor = indoor.trim();
    if (inNotes) indoor += ` ${inNotes}`;

    const outYear = v('out_year');
    const outBrand = v('out_brand') === 'Other' ? (v('out_brand_other') || 'Other') : v('out_brand');
    const outTons = v('out_tons');
    const outType = v('out_type');
    const outCoil = v('out_coil');
    const outContactor = v('out_contactor');
    const outCapSpec = v('out_cap_spec');
    const outCapActual = v('out_cap_actual');
    const outCapStatus = v('out_cap_status');
    const hasDefrost = chk('out_defrost');
    const outDefrostSt = v('out_defrost_status');
    const outRefMode = v('out_ref_mode');
    const outRefStatus = v('out_ref_status');
    const refAmount = v('out_ref_added_amount');
    const outNotes = v('out_notes');
    const outYearPart = outYear ? `${outYear} ` : '';

    let outdoor = `${outYearPart}${outBrand} ${outTons} ton ${outType}. `;
    outdoor += outCoil === 'chemically cleaned'
      ? `Outdoor coil was inspected, found dirty, and was chemically cleaned. `
      : outCoil === 'dirty and needs to be cleaned'
        ? `Outdoor coil was inspected, found dirty, and needs to be chemically cleaned. `
        : `Outdoor coil was inspected and is ${outCoil}. `;
    if (outContactor === 'properly') outdoor += `Contactor was tested for operation and is operating properly. `;
    else if (outContactor === 'not properly') outdoor += `Contactor was tested for operation and is not operating properly. `;
    else outdoor += `Contactor was inspected and is pitted and should be replaced. `;
    if (outCapSpec && outCapActual) {
      if (outCapStatus === 'in') outdoor += `Capacitor is a ${outCapSpec} MFD and measured ${outCapActual} MFD and is in spec. `;
      else if (outCapStatus === 'replaced') outdoor += `Capacitor is a ${outCapSpec} MFD and measured ${outCapActual} MFD and is not in spec. Capacitor was replaced with customer approval. `;
      else outdoor += `Capacitor is a ${outCapSpec} MFD and measured ${outCapActual} MFD and is not in spec and should be replaced. `;
    }
    if (hasDefrost) {
      outdoor += outDefrostSt === 'properly'
        ? `Defrost was tested and is operating properly. `
        : `Defrost was tested and is not operating properly. `;
    }
    if (outRefStatus === 'within') {
      outdoor += `Refrigerant pressures were tested in ${outRefMode} and are within manufacturer specifications.`;
    } else if (refAmount) {
      outdoor += `Refrigerant pressures were tested in ${outRefMode} and were not within manufacturer specifications. System was found to be low on refrigerant. ${refAmount} lbs of refrigerant was added to bring the system back to manufacturer specifications.`;
    } else {
      outdoor += `Refrigerant pressures were tested in ${outRefMode} and are not within manufacturer specifications. System is low on refrigerant.`;
    }
    if (outNotes) outdoor += ` ${outNotes}`;

    return isOutdoorHidden(d)
      ? `${locationLine}Indoor\n${indoor}`
      : `${locationLine}Indoor\n${indoor}\n\nOutdoor\n${outdoor}`;
  }

  /** Default values for a fresh form (matches Hales-Tools starting state). */
  function noteDefaults() {
    const d = {};
    const all = [].concat(NOTE_FIELDS.header, NOTE_FIELDS.indoor, NOTE_FIELDS.outdoor, NOTE_FIELDS.miniOutdoor);
    for (let i = 1; i <= 6; i++) all.push.apply(all, NOTE_FIELDS.miniIndoor(i));
    all.forEach(f => { d[f.id] = f.type === 'check' ? false : (f.def !== undefined ? f.def : ''); });
    return d;
  }

  const api = { NOTE_FIELDS, buildServiceNote, noteDefaults, isFurnaceLike, isOutdoorHidden, showFurnaceChecks, isHeatingCall };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HalesNotes = api;
})(this);
