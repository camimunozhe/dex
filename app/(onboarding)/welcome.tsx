import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Image,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Slide = {
  iconName?: IoniconName;
  iconColor?: string;
  useLogo?: boolean;
  title: string;
  desc: string;
};

const SLIDES: Slide[] = [
  {
    useLogo: true,
    title: 'Bienvenido a Trocora',
    desc: 'La forma simple de intercambiar y vender cartas de TCG con coleccionistas cerca tuyo.',
  },
  {
    iconName: 'pricetag-outline',
    iconColor: '#4ADE80',
    title: 'Publica tus cartas',
    desc: 'Agrega tu colección y marca las cartas que ofreces para intercambio o venta. Tú decides qué mostrar.',
  },
  {
    iconName: 'chatbubbles-outline',
    iconColor: '#A5B4FC',
    title: 'Negocia por chat',
    desc: 'Cuando alguien quiera una carta, abren un chat para acordar qué das a cambio, el precio, o ambos.',
  },
  {
    iconName: 'people-outline',
    iconColor: '#FB923C',
    title: 'Conecta cerca tuyo',
    desc: 'Solo verás coleccionistas en las regiones que elijas. Vamos a configurarlas en un momento.',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const isLast = page === SLIDES.length - 1;

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (next !== page) setPage(next);
  }

  function goNext() {
    if (isLast) {
      router.replace('/(onboarding)/games');
      return;
    }
    scrollRef.current?.scrollTo({ x: SCREEN_WIDTH * (page + 1), animated: true });
  }

  function skip() {
    router.replace('/(onboarding)/games');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <View style={{ width: 60 }} />
        <View style={{ flex: 1 }} />
        {!isLast && (
          <TouchableOpacity onPress={skip} hitSlop={12}>
            <Text style={styles.skip}>Saltar</Text>
          </TouchableOpacity>
        )}
        {isLast && <View style={{ width: 60 }} />}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <View style={styles.iconWrap}>
              {slide.useLogo ? (
                <Image source={require('../../assets/icon.png')} style={styles.logo} />
              ) : (
                <Ionicons name={slide.iconName!} size={64} color={slide.iconColor!} />
              )}
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.desc}>{slide.desc}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>{isLast ? 'Empezar' : 'Siguiente'}</Text>
          <Ionicons name={isLast ? 'arrow-forward' : 'chevron-forward'} size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, minHeight: 36 },
  skip: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },

  slide: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 16,
  },
  iconWrap: {
    width: 120, height: 120, borderRadius: 28,
    backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  logo: { width: 80, height: 80, borderRadius: 18 },
  title: { color: '#F1F5F9', fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  desc: { color: '#94A3B8', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },

  footer: { padding: 24, paddingBottom: 36, gap: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#334155' },
  dotActive: { backgroundColor: '#6366F1', width: 20 },

  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16,
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
