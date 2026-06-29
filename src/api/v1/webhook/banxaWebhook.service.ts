import { Injectable, Logger } from '@nestjs/common';
import { NotificationDto } from '../notification/dto/notification.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { DeviceService } from '../device/device.service';
import mongoose from 'mongoose';

type OrderNotification = {
    title: string
    message: string
}

type Order = {
    status: string
    order_type: 'BUY' | 'SELL'
    crypto_coin: string
    crypto_blockchain: string
    crypto_amount: string
    fiat_currency: string
    fiat_amount: string
}
@Injectable()
export class BanxaWebhookService {
    private readonly logger = new Logger(BanxaWebhookService.name);
    constructor(
        private readonly notificationService: FirebaseNotificationService,
        private readonly deviceService: DeviceService,
    ) { }

    async handleWebHook(dto: any): Promise<void> {
        try {
            this.logger.debug("banxa webhook", dto);
            const currentDevice = await this.deviceService.findOne(dto.external_id as unknown as mongoose.Schema.Types.ObjectId);
            if (currentDevice === null) {
                this.logger.error(`=== device not found ====`);
                return;
            }
            const notificationObj = await this.getOrderNotification(dto);
            this.processTxNotification(notificationObj, currentDevice.fcmToken);
        } catch (error) {
            this.logger.error('banxa notification error:', error);
        }
    }

    private async getOrderNotification(order: Order): Promise<OrderNotification> {
        const cryptoAmount = Number(order.crypto_amount).toFixed(0)
        const fiatAmount = Number(order.fiat_amount).toFixed(2)
        switch (order.status) {
            case 'pendingPayment':
                return {
                    title: 'Complete Your Payment',
                    message: order.order_type === 'BUY'
                        ? `Your order for ${cryptoAmount} ${order.crypto_coin} is awaiting payment of ${fiatAmount} ${order.fiat_currency}.`
                        : `Your sell order has been created and is awaiting approval before crypto can be sent.`,
                }

            case 'waitingPayment':
                return {
                    title: 'Waiting for Payment',
                    message: order.order_type === 'BUY'
                        ? `Your payment is being confirmed by the payment provider.`
                        : `Please send ${cryptoAmount} ${order.crypto_coin} to the provided wallet address.`,
                }

            case 'paymentReceived':
                return {
                    title: 'Payment Received',
                    message: order.order_type === 'BUY'
                        ? `Your payment of ${fiatAmount} ${order.fiat_currency} has been received.`
                        : `Your crypto payment of ${cryptoAmount} ${order.crypto_coin} has been received.`,
                }

            case 'inProgress':
                return {
                    title: 'Order Processing',
                    message: 'Your order is currently being verified and processed.',
                }

            case 'cryptoTransferred':
                return {
                    title: 'Crypto Sent',
                    message: `${cryptoAmount} ${order.crypto_coin} has been submitted to the blockchain.`,
                }

            case 'complete':
                return {
                    title: 'Order Completed',
                    message: order.order_type === 'BUY'
                        ? `Your purchase of ${cryptoAmount} ${order.crypto_coin} is complete.`
                        : `Your sell order has been completed and fiat funds have been sent.`,
                }

            case 'cancelled':
                return {
                    title: 'Order Cancelled',
                    message: 'Your order has been cancelled due to compliance or risk checks.',
                }

            case 'declined':
                return {
                    title: 'Payment Declined',
                    message: 'Your payment was declined by the payment provider.',
                }

            case 'expired':
                return {
                    title: 'Order Expired',
                    message: 'Payment was not received within the allowed time window.',
                }

            case 'refunded':
                return {
                    title: 'Order Refunded',
                    message: 'Your order has been refunded successfully.',
                }

            case 'extraVerification':
                return {
                    title: 'Additional Verification Required',
                    message: 'Your order requires additional verification. Support will contact you shortly.',
                }

            default:
                return {
                    title: 'Order Update',
                    message: 'Your order status has been updated.',
                }
        }
    }
    private async processTxNotification(OrderNotification: OrderNotification, deviceFcm: string): Promise<void> {
        const notificationPayload: NotificationDto = {
            title: OrderNotification.title,
            body: OrderNotification.message,
            data: {},
        };
        await this.notificationService.sendNotification(
            deviceFcm as string,
            notificationPayload,
        );
    }
}