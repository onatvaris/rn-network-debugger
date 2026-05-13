/**
 * Axios interceptor
 *
 * Axios zaten XHR/fetch üzerinde çalışır. Bu interceptor, Axios'un
 * request/response interceptor API'sini kullanarak istek detaylarını
 * daha zengin bir şekilde yakalar (config, baseURL, vs.).
 *
 * Axios yüklü değilse sessizce atlanır.
 */

export function interceptAxios(emitter) {
  let axios;
  try {
    axios = require('axios');
    // axios default export veya .default olabilir
    if (axios.default) axios = axios.default;
  } catch {
    // Axios yüklü değil, atla
    return;
  }

  // Request interceptor
  axios.interceptors.request.use(
    (config) => {
      const url = buildFullUrl(config);
      const id = emitter.onRequestStart({
        url,
        method: config.method?.toUpperCase() || 'GET',
        headers: flattenAxiosHeaders(config.headers),
        body: config.data,
        type: 'axios',
      });

      // id'yi config'e ekle, response interceptor'da kullanalım
      config._debugId = id;
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor
  axios.interceptors.response.use(
    (response) => {
      const id = response.config?._debugId;
      if (id) {
        emitter.onRequestDone(id, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers || {},
          body: response.data,
          size: JSON.stringify(response.data || '').length,
        });
      }
      return response;
    },
    (error) => {
      const id = error.config?._debugId;
      if (id) {
        if (error.response) {
          emitter.onRequestDone(id, {
            status: error.response.status,
            statusText: error.response.statusText,
            headers: error.response.headers || {},
            body: error.response.data,
            size: JSON.stringify(error.response.data || '').length,
          });
        } else {
          emitter.onRequestError(id, error);
        }
      }
      return Promise.reject(error);
    }
  );
}

function buildFullUrl(config) {
  if (!config) return '';
  const base = config.baseURL || '';
  const url = config.url || '';
  if (url.startsWith('http')) return url;
  return base.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
}

function flattenAxiosHeaders(headers) {
  if (!headers) return {};
  // Axios'un header nesnesi iç içe olabilir (common, get, post, vs.)
  const result = {};
  const skip = ['common', 'delete', 'get', 'head', 'post', 'put', 'patch'];
  Object.entries(headers).forEach(([key, value]) => {
    if (!skip.includes(key) && typeof value === 'string') {
      result[key] = value;
    }
  });
  return result;
}
