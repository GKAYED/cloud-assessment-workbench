"""Create explicitly synthetic demo profiles without calling external services.

Run from backend: python -m app.demo
This adds new profiles only; it never replaces an existing customer profile.
"""
import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import AssessmentSnapshotDB, CustomerProfileDB, async_session, init_db


async def main():
    await init_db()
    async with async_session() as db:
        for number in (1, 2):
            name = f'[Synthetic demo {number}] Example Organisation'
            existing = await db.execute(select(CustomerProfileDB).where(CustomerProfileDB.customer_name == name))
            if existing.scalar_one_or_none():
                print(f'Demo {number} already exists; leaving it unchanged.')
                continue
            profile = CustomerProfileDB(customer_name=name, status='Cached', report_version='v2')
            db.add(profile)
            await db.flush()
            sub = f'00000000-0000-4000-8000-{number:012d}'
            resource = {'id': f'/subscriptions/{sub}/resourceGroups/rg-demo/providers/Microsoft.Web/sites/demo-web',
                        'name': 'demo-web', 'type': 'microsoft.web/sites', 'location': 'australiaeast',
                        'resource_group': 'rg-demo', 'subscription_id': sub, 'subscription_name': 'Synthetic subscription',
                        'tags': {'purpose':'synthetic-demo'}, 'is_tagged': True}
            modules = {
                'inventory.summary': {'total_resources':1, 'total_resource_groups':1, 'total_subscriptions':1,
                    'by_type': {'microsoft.web/sites':1}, 'by_location': {'australiaeast':1}, 'tagged_resources':1, 'untagged_resources':0},
                'inventory.resources': [resource],
                'inventory.subscriptions': [{'subscription_id':sub, 'display_name':'Synthetic subscription', 'state':'Enabled'}],
                'inventory.resource_groups': [{'name':'rg-demo', 'subscription_id':sub, 'location':'australiaeast', 'resource_count':1, 'tags':{}}],
                'inventory.databases': [],
                'cost.summary': {'total': 100 * number, 'total_cost_1m':100 * number, 'total_cost_3m':300 * number,
                    'total_cost_6m':600 * number, 'currency':'USD', 'monthly_trend':[], 'trend':'stable'},
                'cost.by_subscription': [{'group_key':sub, 'group_type':'subscription', 'subscription_id':sub,
                    'subscription_name':'Synthetic subscription', 'cost_1m':100 * number, 'cost_3m':300 * number, 'cost_6m':600 * number, 'trend':'stable'}],
                'cost.by_resource': [], 'cost.by_resource_group': [], 'cost.by_resource_type': [],
                'data_gaps.list': {'data_gaps': [], 'summary': {'total':0}, 'demo_notice':'Synthetic example; no live security, governance or licensing assessment has been performed.'},
            }
            for module, data in modules.items():
                db.add(AssessmentSnapshotDB(profile_id=profile.id, module_name=module,
                    data_json=json.dumps(data), snapshot_at=datetime.now(timezone.utc), is_partial=True))
            print(f'Created synthetic demo profile {profile.id}. Missing modules intentionally remain empty.')
        await db.commit()


if __name__ == '__main__':
    asyncio.run(main())
