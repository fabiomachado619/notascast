export function normalizeBR(phone) {
  if (!phone) return '';
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  let ddd, number;

  if (cleaned.length >= 10) {
      if (cleaned.startsWith('55') && cleaned.length >= 12) {
          ddd = cleaned.substring(2, 4);
          number = cleaned.substring(4);
      } else {
          ddd = cleaned.substring(0, 2);
          number = cleaned.substring(2);
      }

      if (number.length === 8 && ddd.charAt(0) === '1') {
          number = '9' + number;
      }
      
      return `+55${ddd}${number}`;
  }
  
  // fallback for incomplete numbers, just add country code
  return `+55${cleaned}`;
}