// Public API of the shipments module.

export { getShipment, createShipment, updateShipment } from './services/shipment.service';
export { shipmentInputSchema, type ShipmentInput } from './schemas';
export { Shipment, type ShipmentDoc } from './models/shipment.model';
