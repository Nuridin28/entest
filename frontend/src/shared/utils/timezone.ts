export const ALMATY_TIMEZONE = 'Asia/Almaty';
export const formatAlmatyTime = (date: string | Date, options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: ALMATY_TIMEZONE
}): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
        return 'Неверная дата';
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
        ...options,
        hour12: false,
        timeZone: ALMATY_TIMEZONE
    }).formatToParts(dateObj);
    const dateParts: {
        [key: string]: string;
    } = {};
    parts.forEach(part => {
        dateParts[part.type] = part.value;
    });
    const day = dateParts.day || '01';
    const month = dateParts.month || '01';
    const year = dateParts.year || '2025';
    const hour = dateParts.hour || '00';
    const minute = dateParts.minute || '00';
    const second = dateParts.second || '00';
    return `${day}.${month}.${year}, ${hour}:${minute}:${second}`;
};
export const formatAlmatyTimeShort = (date: string | Date): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
        return 'Неверная дата';
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: ALMATY_TIMEZONE
    }).formatToParts(dateObj);
    const dateParts: {
        [key: string]: string;
    } = {};
    parts.forEach(part => {
        dateParts[part.type] = part.value;
    });
    const day = dateParts.day || '01';
    const month = dateParts.month || '01';
    const year = dateParts.year || '2025';
    const hour = dateParts.hour || '00';
    const minute = dateParts.minute || '00';
    return `${day}.${month}.${year}, ${hour}:${minute}`;
};
export const formatAlmatyTimeOnly = (date: string | Date): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
        return 'Неверная дата';
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: ALMATY_TIMEZONE
    }).formatToParts(dateObj);
    const timeParts: {
        [key: string]: string;
    } = {};
    parts.forEach(part => {
        timeParts[part.type] = part.value;
    });
    const hour = timeParts.hour || '00';
    const minute = timeParts.minute || '00';
    const second = timeParts.second || '00';
    return `${hour}:${minute}:${second}`;
};
export const formatAlmatyDateOnly = (date: string | Date): string => {
    return formatAlmatyTime(date, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: ALMATY_TIMEZONE
    });
};
export const getCurrentAlmatyTime = (): string => {
    return formatAlmatyTime(new Date());
};
export const isSameDayAlmaty = (date1: string | Date, date2: string | Date): boolean => {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    const almatyDate1 = formatAlmatyDateOnly(d1);
    const almatyDate2 = formatAlmatyDateOnly(d2);
    return almatyDate1 === almatyDate2;
};
export const calculateDuration = (startTime: string | Date, endTime: string | Date): string => {
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
    const diffMs = end.getTime() - start.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    if (diffMinutes > 0) {
        return `${diffMinutes} мин ${diffSeconds} сек`;
    }
    else {
        return `${diffSeconds} сек`;
    }
};
export const getAlmatyTimezoneInfo = () => {
    const now = new Date();
    const almatyTime = new Date(now.toLocaleString("en-US", { timeZone: ALMATY_TIMEZONE }));
    const offset = (almatyTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return {
        timezone: ALMATY_TIMEZONE,
        name: 'Алматы',
        offset: `UTC${offset >= 0 ? '+' : ''}${offset}`,
        currentTime: getCurrentAlmatyTime()
    };
};
export interface TimeDisplayProps {
    date: string | Date;
    format?: 'full' | 'short' | 'time' | 'date';
    showTimezone?: boolean;
}
export const getFormattedTime = ({ date, format = 'full', showTimezone = false }: TimeDisplayProps): string => {
    let formattedTime: string;
    switch (format) {
        case 'short':
            formattedTime = formatAlmatyTimeShort(date);
            break;
        case 'time':
            formattedTime = formatAlmatyTimeOnly(date);
            break;
        case 'date':
            formattedTime = formatAlmatyDateOnly(date);
            break;
        default:
            formattedTime = formatAlmatyTime(date);
    }
    if (showTimezone) {
        formattedTime += ' (Алматы)';
    }
    return formattedTime;
};
export const debugTimeFormatting = (date: string | Date): void => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    console.log('=== Debug Time Formatting ===');
    console.log('Original date:', date);
    console.log('Date object:', dateObj);
    console.log('UTC time:', dateObj.toISOString());
    console.log('Almaty full:', formatAlmatyTime(dateObj));
    console.log('Almaty short:', formatAlmatyTimeShort(dateObj));
    console.log('Almaty time only:', formatAlmatyTimeOnly(dateObj));
    console.log('Almaty date only:', formatAlmatyDateOnly(dateObj));
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: ALMATY_TIMEZONE
    }).formatToParts(dateObj);
    console.log('Date parts:', parts);
    console.log('==============================');
};
