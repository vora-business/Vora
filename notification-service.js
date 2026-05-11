import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Centralized notification service for creating personalized notifications
 * Only creates notifications for relevant users based on their activities
 */

export const NotificationService = {
  /**
   * Create a notification for a specific user
   * @param {string} userId - Target user ID
   * @param {string} type - Notification type (offer, booking, message, request, review, payment, etc.)
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {object} metadata - Additional data (offerId, bookingId, senderId, etc.)
   * @param {string} relatedUserId - ID of the user triggering the notification
   */
  async createNotification(userId, type, title, message, metadata = {}, relatedUserId = null) {
    if (!userId) {
      console.error('createNotification: userId is required');
      return null;
    }

    try {
      const notificationId = doc(collection(db, 'notifications')).id;
      
      await setDoc(doc(db, 'notifications', notificationId), {
        userId,                          // Who receives this notification
        type,                            // Type of notification
        title,                           // Display title
        message,                         // Display message
        metadata,                        // Related data (IDs, amounts, etc.)
        relatedUserId,                   // Who triggered this (for activity context)
        read: false,                     // Unread status
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return notificationId;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  },

  /**
   * Offer-related notifications
   */
  async notifyOfferReceived(customerId, providerId, offerPrice, serviceType) {
    return this.createNotification(
      customerId,
      'offer_received',
      '💰 New Offer Received',
      `A provider offered ₦${offerPrice?.toLocaleString()} for your ${serviceType} request`,
      { offerId: null, providerId, offerPrice, serviceType },
      providerId
    );
  },

  async notifyOfferAccepted(providerId, customerId, offerPrice) {
    return this.createNotification(
      providerId,
      'offer_accepted',
      '✅ Offer Accepted',
      `Your offer of ₦${offerPrice?.toLocaleString()} has been accepted. Proceed to complete the booking.`,
      { offerPrice, customerId },
      customerId
    );
  },

  async notifyOfferRejected(providerId, offerPrice) {
    return this.createNotification(
      providerId,
      'offer_rejected',
      '❌ Offer Declined',
      `Your offer of ₦${offerPrice?.toLocaleString()} has been declined.`,
      { offerPrice }
    );
  },

  /**
   * Booking-related notifications
   */
  async notifyBookingConfirmed(providerId, customerId, bookingAmount) {
    return this.createNotification(
      providerId,
      'booking_confirmed',
      '📅 Booking Confirmed',
      `New booking confirmed for ₦${bookingAmount?.toLocaleString()}`,
      { bookingAmount, customerId },
      customerId
    );
  },

  async notifyBookingCancelled(providerId, customerName) {
    return this.createNotification(
      providerId,
      'booking_cancelled',
      '⛔ Booking Cancelled',
      `${customerName} has cancelled their booking`,
      {}
    );
  },

  async notifyBookingCompleted(customerId, providerName, bookingAmount) {
    return this.createNotification(
      customerId,
      'booking_completed',
      '🎉 Service Completed',
      `${providerName} has marked the booking as completed`,
      { bookingAmount },
      null
    );
  },

  /**
   * Message notifications
   */
  async notifyNewMessage(recipientId, senderName, messagePreview, senderId) {
    return this.createNotification(
      recipientId,
      'new_message',
      `💬 Message from ${senderName}`,
      messagePreview.length > 60 ? messagePreview.substring(0, 60) + '...' : messagePreview,
      { senderName, senderId, messagePreview },
      senderId
    );
  },

  /**
   * Payment notifications
   */
  async notifyPaymentReceived(providerId, customerName, amount) {
    return this.createNotification(
      providerId,
      'payment_received',
      '💳 Payment Received',
      `Payment of ₦${amount?.toLocaleString()} from ${customerName}`,
      { amount, customerName },
      null
    );
  },

  async notifyPaymentFailed(customerId, amount) {
    return this.createNotification(
      customerId,
      'payment_failed',
      '⚠️ Payment Failed',
      `Payment of ₦${amount?.toLocaleString()} could not be processed. Please try again.`,
      { amount }
    );
  },

  /**
   * Service request notifications
   */
  async notifyNewServiceRequest(providerId, customerName, serviceType, budget) {
    return this.createNotification(
      providerId,
      'new_request',
      '📋 New Service Request',
      `${customerName} requested ${serviceType} (Budget: ₦${budget?.toLocaleString()})`,
      { serviceType, budget, customerName },
      null
    );
  },

  /**
   * Review notifications
   */
  async notifyReviewReceived(providerId, reviewerName, rating) {
    const stars = '⭐'.repeat(rating);
    return this.createNotification(
      providerId,
      'review_received',
      `${stars} Review from ${reviewerName}`,
      `You received a ${rating}-star review`,
      { rating, reviewerName },
      null
    );
  },

  async notifyReviewResponse(customerId, providerName) {
    return this.createNotification(
      customerId,
      'review_response',
      `📝 ${providerName} Responded to Your Review`,
      `${providerName} has responded to your review`,
      { providerName },
      null
    );
  },

  /**
   * Profile activity notifications
   */
  async notifyProfileViewed(providerId, visitorName) {
    return this.createNotification(
      providerId,
      'profile_viewed',
      `👀 ${visitorName} Viewed Your Profile`,
      `Someone visited your provider profile`,
      { visitorName },
      null
    );
  },

  /**
   * Service-related notifications
   */
  async notifyServiceApproved(providerId, serviceName) {
    return this.createNotification(
      providerId,
      'service_approved',
      '✅ Service Approved',
      `Your service "${serviceName}" has been approved and is now live`,
      { serviceName }
    );
  },

  async notifyServiceRejected(providerId, serviceName, reason) {
    return this.createNotification(
      providerId,
      'service_rejected',
      '❌ Service Review',
      `Your service "${serviceName}" needs adjustment: ${reason}`,
      { serviceName, reason }
    );
  },

  /**
   * Admin/system notifications
   */
  async notifyAccountVerification(userId, status) {
    const title = status === 'approved' ? '✅ Account Verified' : '⏳ Verification Pending';
    return this.createNotification(
      userId,
      'verification_update',
      title,
      status === 'approved' 
        ? 'Your account has been verified! You can now offer services.'
        : 'Your account verification is under review. We will notify you soon.',
      { status }
    );
  },

  async notifyPayout(providerId, amount, bankName) {
    return this.createNotification(
      providerId,
      'payout_processed',
      '💰 Payout Processed',
      `Payout of ₦${amount?.toLocaleString()} sent to ${bankName}`,
      { amount, bankName }
    );
  },

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId) {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    try {
      // This would need a cloud function to update all in batch
      // For now, it's handled on the client side in notifications.js
      console.log('Mark all as read for user:', userId);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }
};

export default NotificationService;
