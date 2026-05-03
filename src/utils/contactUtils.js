export function normalizeBrazilianPhoneNumber(phone) {
  if (!phone) return { phone_e164: null, ddd: null, error: 'Número vazio' };

  let cleaned = phone.toString().replace(/\D/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  }

  if (!cleaned.startsWith('+')) {
    if (cleaned.length < 8) return { phone_e164: null, ddd: null, error: 'Número muito curto' };
    
    if (cleaned.length <= 9) { // Assume DDD local
        return { phone_e164: null, ddd: null, error: 'DDD ausente' };
    }

    if (!cleaned.startsWith('55')) {
      cleaned = '55' + cleaned;
    }
    cleaned = '+' + cleaned;
  }
  
  if (cleaned.startsWith('+55')) {
    const ddd = cleaned.substring(3, 5);
    let numberPart = cleaned.substring(5);
    
    if (numberPart.length === 8 && /^[2-9]/.test(numberPart)) {
      numberPart = '9' + numberPart;
    }

    if (numberPart.length < 8 || numberPart.length > 9) {
      return { phone_e164: null, ddd, error: 'Número inválido após DDD' };
    }
    
    const phone_e164 = `+55${ddd}${numberPart}`;
    return { phone_e164, ddd, error: null };
  }
  
  return { phone_e164: cleaned, ddd: null, error: 'Formato não brasileiro' };
}

export function parseContactDate(dateString) {
  if (!dateString) return null;
  const isoRegex = /^\d{4}-\d{2}-\d{2}/;
  if (isoRegex.test(dateString)) {
    return new Date(dateString).toISOString().split('T')[0];
  }

  const brRegex = /^(\d{2})\/(\d{2})\/(\d{4})/;
  const match = dateString.match(brRegex);
  if (match) {
    const [_, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function generateCsv(headers, data) {
  const csvRows = [];
  csvRows.push(headers.join(','));

  for (const row of data) {
    const values = headers.map(header => {
      const escaped = ('' + row[header]).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

export const downloadCsv = (csvString, filename) => {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};