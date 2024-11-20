const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const logger = require('../config/logger');

const transport = nodemailer.createTransport(config.email.smtp);
/* istanbul ignore next */
if (config.env !== 'test') {
  transport
    .verify()
    .then(() => logger.info('Connected to email server'))
    .catch(() => logger.warn('Unable to connect to email server. Make sure you have configured the SMTP options in .env'));
}

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @returns {Promise}
 */
const sendEmail = async (to, subject, html) => {
  const msg = { from: config.email.from, to, subject, html };
  await transport.sendMail(msg);
};

/**
 * Load HTML template and replace placeholders
 * @param {string} templateName
 * @param {object} replacements
 * @returns {Promise<string>}
 */
const loadTemplate = async (templateName, replacements) => {
  const filePath = path.join(__dirname, '..', 'public', 'templates', `${templateName}.html`);
  let template = await fs.readFile(filePath, 'utf8');
  // eslint-disable-next-line guard-for-in, no-restricted-syntax
  for (const key in replacements) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
  }
  return template;
};

/**
 * Send reset password email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendResetPasswordEmail = async (to, token) => {
  const subject = 'Reset password';
  const resetPasswordUrl = `http://localhost:3100/v1/auth/reset-password?token=${token}`;
  const html = await loadTemplate('reset_password', { resetPasswordUrl });
  await sendEmail(to, subject, html);
};

const sendVerificationEmail = async (to, token) => {
  const subject = 'Email Verification';
  const verificationEmailUrl = `http://localhost:3100/v1/auth/verify-email?token=${token}`;
  const html = await loadTemplate('verification_email', { verificationEmailUrl });
  await sendEmail(to, subject, html);
};

const sendInvitationEmail = async (to, sessionId) => {
  const subject = 'Session Invitation';
  const joinSessionURL = `http://localhost:3100/v1/session/joinSession/${sessionId}`;
  const html = await loadTemplate('invitation_email', { joinSessionURL });
  await sendEmail(to, subject, html);
};

const sendDocumentUploadEmail = async (to, userName, documentId) => {
  if (!to || !userName || !documentId) {
    throw new Error('Missing required parameters for sending document upload email');
  }

  console.log(`Preparing to send Document Upload Confirmation Email to: ${to}`);

  const subject = 'Document Upload Confirmation';
  const html = await loadTemplate('document_upload_confirmation', { userName, documentId });

  try {
    await sendEmail(to, subject, html);
    console.log(`Document Upload Confirmation Email sent to ${to}`);
  } catch (error) {
    console.error(`Failed to send Document Upload Confirmation Email to ${to}:`, error);
    throw error;
  }
};

const sendDocumentStatusUpdateEmail = async (email, documentId, currentStatus, newStatus, feedback) => {
  const subject = newStatus === 'rejected' ? 'Tài liệu bị từ chối' : 'Cập nhật trạng thái tài liệu';

  const replacements = {
    documentId,
    currentStatus,
    newStatus,
    hasFeedback: !!feedback,
    feedback: feedback || '',
  };

  const html = await loadTemplate('document_status_update', replacements);
  await sendEmail(email, subject, html);
};

const sendPaymentEmail = async (email, documentId, paymentLinkResponse) => {
  const subject = 'Thanh toán công chứng';
  const paymentLink = paymentLinkResponse.checkoutUrl;
  const html = await loadTemplate('payment_email', { documentId, paymentLink });
  await sendEmail(email, subject, html);
};

module.exports = {
  transport,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendInvitationEmail,
  sendDocumentUploadEmail,
  sendDocumentStatusUpdateEmail,
  sendPaymentEmail,
};
