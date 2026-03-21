/**
 * Bug Report — section Paramètres
 * Envoi vers table bug_reports + notification ADMIN/SUPERADMIN via admin_messages
 */
(function () {
  'use strict';

  var MAX_DESCRIPTION_LENGTH = 2000;
  var MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 Mo

  function t(key) {
    return (typeof window.i18nT === 'function' ? window.i18nT(key) : key);
  }

  function updateCharCount() {
    var el = document.getElementById('bugReportDescription');
    var countEl = document.getElementById('bugReportCharCount');
    if (!el || !countEl) return;
    var len = (el.value || '').length;
    countEl.textContent = len + ' / ' + MAX_DESCRIPTION_LENGTH;
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Read error')); };
      reader.readAsDataURL(file);
    });
  }

  function showMessage(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    el.style.color = isError ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)';
  }

  function hideMessage(el) {
    if (el) el.style.display = 'none';
  }

  function initBugReport() {
    var formDesc = document.getElementById('bugReportDescription');
    var charCount = document.getElementById('bugReportCharCount');
    var photoInput = document.getElementById('bugReportPhoto');
    var photoError = document.getElementById('bugReportPhotoError');
    var submitBtn = document.getElementById('bugReportSubmitBtn');
    var messageEl = document.getElementById('bugReportMessage');

    if (charCount) charCount.textContent = '0 / ' + MAX_DESCRIPTION_LENGTH;
    if (formDesc) {
      formDesc.addEventListener('input', updateCharCount);
      formDesc.addEventListener('paste', updateCharCount);
    }

    if (photoInput) {
      photoInput.addEventListener('change', function () {
        hideMessage(photoError);
        var files = photoInput.files;
        if (!files || files.length === 0) return;
        if (files.length > 1) {
          photoInput.value = '';
          if (photoError) {
            photoError.textContent = t('bug_report_photo_label');
            photoError.style.display = 'block';
          }
          return;
        }
        var file = files[0];
        if (file.size > MAX_PHOTO_BYTES) {
          photoInput.value = '';
          showMessage(photoError, t('bug_report_error_photo_size'), true);
        }
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async function () {
        hideMessage(messageEl);
        if (photoError) hideMessage(photoError);

        var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (!supabase) {
          if (typeof showToast === 'function') showToast(t('bug_report_error_generic'), 'error');
          return;
        }
        var user = (await supabase.auth.getUser()).data?.user;
        if (!user) {
          showMessage(messageEl, t('bug_report_error_auth'), true);
          if (typeof showToast === 'function') showToast(t('bug_report_error_auth'), 'error');
          return;
        }

        var categoryEl = document.getElementById('bugReportCategory');
        var descriptionEl = document.getElementById('bugReportDescription');
        var category = categoryEl && categoryEl.value ? categoryEl.value.trim() : 'other';
        var description = descriptionEl && descriptionEl.value ? descriptionEl.value.trim() : '';

        if (!description) {
          showMessage(messageEl, t('bug_report_error_description'), true);
          if (typeof showToast === 'function') showToast(t('bug_report_error_description'), 'warning');
          return;
        }

        if (description.length > MAX_DESCRIPTION_LENGTH) {
          description = description.slice(0, MAX_DESCRIPTION_LENGTH);
        }

        var imageUrl = null;
        var photoInputEl = document.getElementById('bugReportPhoto');
        if (photoInputEl && photoInputEl.files && photoInputEl.files.length === 1) {
          var file = photoInputEl.files[0];
          if (file.size <= MAX_PHOTO_BYTES) {
            try {
              imageUrl = await readFileAsDataUrl(file);
            } catch (e) {
              Logger.warn('[BugReport] Photo read error', e);
            }
          }
        }

        submitBtn.disabled = true;
        try {
          var res = await supabase.rpc('insert_bug_report', {
            p_category: category,
            p_description: description,
            p_image_url: imageUrl
          });
          var data = res.data;
          var error = res.error;

          if (error) {
            showMessage(messageEl, error.message || t('bug_report_error_generic'), true);
            if (typeof showToast === 'function') showToast(error.message || t('bug_report_error_generic'), 'error');
            return;
          }
          if (data && data.success) {
            showMessage(messageEl, t('bug_report_success'), false);
            if (typeof showToast === 'function') showToast(t('bug_report_success'), 'success');
            if (descriptionEl) descriptionEl.value = '';
            if (photoInputEl) photoInputEl.value = '';
            updateCharCount();
            setTimeout(function () { hideMessage(messageEl); }, 5000);
          } else {
            showMessage(messageEl, (data && data.error) || t('bug_report_error_generic'), true);
            if (typeof showToast === 'function') showToast((data && data.error) || t('bug_report_error_generic'), 'error');
          }
        } catch (e) {
          Logger.error('[BugReport]', e);
          showMessage(messageEl, t('bug_report_error_generic'), true);
          if (typeof showToast === 'function') showToast(t('bug_report_error_generic'), 'error');
        } finally {
          submitBtn.disabled = false;
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBugReport);
  } else {
    initBugReport();
  }

  window.addEventListener('languageChanged', function () {
    updateCharCount();
  });
})();
