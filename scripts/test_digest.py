import unittest
from digest import city_records, news_records


class DigestImportTests(unittest.TestCase):
    def test_opportunity_summary_rows_are_excluded_from_events(self):
        events, opportunities = city_records([
            ('Nov 16, 2026', [
                {'Event': 'Studio meetup', 'Category': 'Networking', 'Time': '0.7916666666666666'},
                {'Event': 'Arts grant', 'Category': 'Opportunity', 'Deadline': '46343.0'},
            ]),
            ('Opportunities', [
                {'Opportunity': 'Arts grant', 'Organizer': 'Arts Council', 'Deadline': '46343.0'},
                {'Opportunity': 'Open call', 'Organizer': 'Arts Council', 'Deadline': 'rolling'},
            ]),
        ])
        self.assertEqual([(item['title'], item['time']) for item in events], [('Studio meetup', '7:00 PM')])
        self.assertEqual([(item['title'], item['date']) for item in opportunities],
                         [('Arts grant', '2026-11-17'), ('Open call', '')])

    def test_feature_articles_inherit_outlet_logos(self):
        light = 'https://example.com/light.png'
        dark = 'https://example.com/dark.png'
        feature, story = news_records([
            ('Nov 16, 2026 AM', [{'Story': 'Daily news', 'Outlet': 'The Outlet', 'Logo (light)': light,
                                 'Logo (dark)': dark, 'Longer version': 'Daily body'}]),
            ('Nov 16, 2026 — Top Articles', [{'Article': 'Feature', 'Source': 'The Outlet',
                                             'Why read it': 'Summary', 'Detailed version': 'Feature body'}]),
        ])
        self.assertEqual((feature['feature'], feature['logoLight'], feature['logoDark'], feature['body']),
                         (True, light, dark, 'Feature body'))
        self.assertEqual((story['feature'], story['body']), (False, 'Daily body'))

    def test_afternoon_stories_precede_morning_and_replace_duplicates(self):
        records = news_records([
            ('Nov 16, 2026 PM', [{'Story': 'Fresh'}, {'Story': 'Developing', 'Summary': 'Updated'}]),
            ('Nov 16, 2026 AM', [{'Story': 'Morning', 'Top': '⭐'}, {'Story': 'Developing', 'Summary': 'Original'}]),
        ])
        self.assertEqual([row['title'] for row in records], ['Fresh', 'Developing', 'Morning'])
        self.assertEqual(records[1]['description'], 'Updated')
