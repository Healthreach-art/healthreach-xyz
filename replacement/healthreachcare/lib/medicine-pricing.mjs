const minor=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Invalid saved medicine price.');return Math.round(value*100);};
export const defaultMedicinePlatformFeeBps=1200;
export const currentVatBps=1500;
export function medicineFeeBreakdown(items,deliveryFee,settings={}){
 const medicineMinor=items.reduce((n,item)=>n+minor(Number(item.medicinePrice??item.price))*item.quantity,0);
 const dispensingMinor=items.reduce((n,item)=>n+minor(Number(item.dispensingFee||0))*item.quantity,0);
 const dispensingVatMinor=items.reduce((n,item)=>n+minor(Number(item.dispensingVat||0))*item.quantity,0);
 const platformFeeBps=Number.isInteger(settings.platformFeeBps)?settings.platformFeeBps:defaultMedicinePlatformFeeBps;
 const platformFeeMinor=Math.round(medicineMinor*platformFeeBps/10000);
 const platformVatMinor=settings.vatRegistered===true?Math.round(platformFeeMinor*currentVatBps/10000):0;
 const deliveryMinor=minor(Number(deliveryFee||0));
 return {medicineMinor,dispensingMinor,dispensingVatMinor,platformFeeBps,platformFeeMinor,platformVatMinor,platformVatBps:settings.vatRegistered===true?currentVatBps:0,deliveryMinor,currency:'ZAR',totalMinor:medicineMinor+dispensingMinor+dispensingVatMinor+platformFeeMinor+platformVatMinor+deliveryMinor};
}
